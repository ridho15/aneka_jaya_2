import "server-only";
import { sendNeoCommand } from "./neo";
import type { PenjualanInput } from "@/lib/validation/penjualanSchema";
import type { ApiResponse } from "@/lib/types/api";
import type { Sale } from "@/lib/types/sales";
import { recordAudit } from "@/lib/audit/store";
import { createApprovalRequest, approvalIsEnabled } from "@/lib/approval/store";
import { createTempoReceivable } from "@/lib/tempo/store";
import { getCurrentUser } from "@/lib/auth/session";
import { findTipe } from "@/lib/business/masterData";
import { saveSalesRecord } from "@/lib/sales/store";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

const usesLocalDataStore = () => process.env.NEXT_PUBLIC_APP_MODE !== "production";

function serializeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

export async function createSale(input: PenjualanInput): Promise<ApiResponse<unknown>> {
  const total = input.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice - (item.discount || 0)), 0);
  const user = await getCurrentUser();
  const tipe = await findTipe(input.tipeId);
  const approvalStatus = user.role === "ADMIN" && approvalIsEnabled("penjualan") ? "pending_approval" : "approved";
  if (usesLocalDataStore()) {
    const sale: Sale = { id: `S-${Date.now()}`, ...input, tipeId: tipe.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, total, approvalStatus, createdByUserId: user.id, createdByNameSnapshot: user.name, createdByRoleSnapshot: user.role, createdAt: new Date().toISOString() };
    await saveSalesRecord(sale);
    if (approvalStatus === "pending_approval") await createApprovalRequest({ module: "penjualan", entityId: sale.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, amount: total });
    if (approvalStatus === "approved" && input.paymentMethod === "Tempo") await createTempoReceivable({ salesId: sale.id, tipeId: tipe.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, customerName: input.customerName, originalAmount: total, transactionDate: input.saleDate, dueDate: input.dueDate || input.saleDate });
    await recordAudit({ entityType: "sales", entityId: sale.id, action: "create", afterValue: sale, reason: `Invoice Penjualan lokal • ${approvalStatus} • ${input.paymentMethod}` });
    return { success: true, data: sale };
  }
  const response = await sendNeoCommand({
    text: `Buat penjualan dan invoice penjualan untuk ${input.customerName} tanggal ${input.saleDate}.`,
    parsedIntent: {
      action: "create_sales", customer_name: input.customerName, date: input.saleDate,
      tipe_id: tipe.id, tipe_code_snapshot: tipe.code, tipe_name_snapshot: tipe.name,
      payment_status: input.paymentMethod, due_date: input.dueDate || undefined, rekening_id: input.rekeningId || undefined,
      delivery_date: input.deliveryDate || undefined, delivery_method: input.shippingMethod || undefined,
      auto_create_invoice: true,
      items: input.items.map((item) => ({ product_ref: item.productRef, quantity: item.quantity, unit_price: item.unitPrice, discount: item.discount || 0 })),
      message: [`Lokasi customer: ${input.customerLocation}`, `Pembayaran: ${input.paymentMethod}${input.transferAccount ? ` - ${input.transferAccount}` : ""}`, input.notes || ""].filter(Boolean).join(". ")
    }
  });
  if (response.success) {
    const sale: Sale = { id: `S-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, ...input, tipeId: tipe.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, total, approvalStatus, createdByUserId: user.id, createdByNameSnapshot: user.name, createdByRoleSnapshot: user.role, createdAt: new Date().toISOString() };
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.salesRecord.create({
        data: {
          id: sale.id,
          saleDate: new Date(sale.saleDate),
          tipeId: tipe.id,
          tipeCodeSnapshot: tipe.code,
          tipeNameSnapshot: tipe.name,
          customerName: sale.customerName,
          customerLocation: sale.customerLocation,
          shippingMethod: sale.shippingMethod,
          paymentMethod: sale.paymentMethod,
          dueDate: sale.dueDate ? new Date(sale.dueDate) : undefined,
          rekeningId: sale.rekeningId,
          transferAccount: sale.transferAccount,
          notes: sale.notes,
          total,
          approvalStatus,
          createdByUserId: user.id,
          createdByNameSnapshot: user.name,
          createdByRoleSnapshot: user.role,
          createdAt: new Date(sale.createdAt || Date.now()),
          items: {
            create: sale.items.map((item, index) => ({
              id: `${sale.id}-item-${index}`,
              productRef: item.productRef,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount || 0,
              sortOrder: index
            }))
          }
        }
      });
      if (approvalStatus === "pending_approval") {
        const approval = {
          id: `APR-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          module: "penjualan",
          entityId: sale.id,
          tipeCodeSnapshot: tipe.code,
          tipeNameSnapshot: tipe.name,
          amount: total,
          status: "pending_approval",
          createdByUserId: user.id,
          createdByNameSnapshot: user.name,
          createdByRoleSnapshot: user.role,
          createdAt: new Date()
        } as const;
        await tx.approvalRequest.create({ data: approval });
        await tx.auditLog.create({
          data: {
            id: crypto.randomUUID(),
            entityType: "approval",
            entityId: approval.id,
            action: "create",
            afterValue: serializeJson({ ...approval, createdAt: approval.createdAt.toISOString() }),
            userId: user.id,
            userNameSnapshot: user.name,
            userRoleSnapshot: user.role,
            reason: "penjualan pending_approval"
          }
        });
      }
      if (approvalStatus === "approved" && input.paymentMethod === "Tempo") {
        const now = new Date();
        await tx.tempoReceivable.create({
          data: {
            id: `TMP-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
            salesId: sale.id,
            tipeId: tipe.id,
            tipeCodeSnapshot: tipe.code,
            tipeNameSnapshot: tipe.name,
            customerName: input.customerName,
            originalAmount: total,
            paidAmount: 0,
            remainingAmount: total,
            transactionDate: new Date(input.saleDate),
            dueDate: new Date(input.dueDate || input.saleDate),
            status: "open",
            createdByUserId: user.id,
            createdByNameSnapshot: user.name,
            createdAt: now,
            updatedAt: now
          }
        });
      }
      await tx.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          entityType: "sales",
          entityId: sale.id,
          action: "create",
          afterValue: serializeJson(sale),
          userId: user.id,
          userNameSnapshot: user.name,
          userRoleSnapshot: user.role,
          reason: `Invoice Penjualan • Terkirim • ${input.paymentMethod}`
        }
      });
    });
  }
  return response;
}
