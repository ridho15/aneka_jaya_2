import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit/store";

const CCTV_TOKEN = process.env.CCTV_INTEGRATION_TOKEN || "cctv-slm-token-2026";

function verifyToken(request: Request): boolean {
  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return false;
  return match[1] === CCTV_TOKEN;
}

export async function POST(request: Request) {
  if (!verifyToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    let cctv_label_id: any;
    let invoice_number: any;
    let customer_name: any;
    let source_label: any;
    let slm_reference: any;
    let event_type: any;
    let packing_completed_at: any;
    let evidence_url: any;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      cctv_label_id = formData.get("cctv_label_id");
      invoice_number = formData.get("invoice_number");
      customer_name = formData.get("customer_name");
      source_label = formData.get("source_label");
      slm_reference = formData.get("slm_reference");
      event_type = formData.get("event_type");
      packing_completed_at = formData.get("packing_completed_at");
      evidence_url = formData.get("evidence_url");
    } else {
      const body = await request.json().catch(() => ({}));
      cctv_label_id = body.cctv_label_id;
      invoice_number = body.invoice_number;
      customer_name = body.customer_name;
      source_label = body.source_label;
      slm_reference = body.slm_reference;
      event_type = body.event_type;
      packing_completed_at = body.packing_completed_at;
      evidence_url = body.evidence_url;
    }

    if (!invoice_number && !slm_reference) {
      return NextResponse.json({ error: "invoice_number or slm_reference is required" }, { status: 400 });
    }

    // Cari SalesRecord
    const sales = await prisma.salesRecord.findFirst({
      where: {
        OR: [
          ...(slm_reference ? [{ id: String(slm_reference) }] : []),
          ...(invoice_number ? [
            { transactionNumber: String(invoice_number).trim() },
            { id: String(invoice_number).trim() }
          ] : [])
        ]
      },
      include: {
        deliveryOrder: true
      }
    });

    if (!sales) {
      return NextResponse.json({
        error: "Sales record not found",
        saved: false
      }, { status: 404 });
    }

    const isPacked = event_type === "packing_completed" || Boolean(packing_completed_at);
    const packedDate = packing_completed_at ? new Date(String(packing_completed_at)) : new Date();

    // Update Delivery Order jika ada
    if (sales.deliveryOrder) {
      const beforeDO = {
        packingStatus: sales.deliveryOrder.packingStatus,
        packedAt: sales.deliveryOrder.packedAt,
        packedByNameSnapshot: sales.deliveryOrder.packedByNameSnapshot,
      };

      await prisma.deliveryOrder.update({
        where: { id: sales.deliveryOrder.id },
        data: {
          packingStatus: isPacked ? "sudah" : sales.deliveryOrder.packingStatus,
          packedAt: isPacked ? (sales.deliveryOrder.packedAt || packedDate) : sales.deliveryOrder.packedAt,
          packedByNameSnapshot: isPacked ? (sales.deliveryOrder.packedByNameSnapshot || "CCTV Auto-Packing") : sales.deliveryOrder.packedByNameSnapshot,
          receiptPhotoUrl: evidence_url ? String(evidence_url) : sales.deliveryOrder.receiptPhotoUrl
        }
      });

      if (isPacked) {
        await prisma.auditLog.create({
          data: {
            id: crypto.randomUUID(),
            entityType: "delivery_order",
            entityId: sales.deliveryOrder.id,
            action: "cctv_packing_sync",
            beforeValue: beforeDO,
            afterValue: {
              packingStatus: "sudah",
              packedAt: packedDate,
              packedByNameSnapshot: "CCTV Auto-Packing",
              receiptPhotoUrl: evidence_url ? String(evidence_url) : sales.deliveryOrder.receiptPhotoUrl,
              cctvLabelId: cctv_label_id ? Number(cctv_label_id) : null,
            },
            userId: "integration:cctv",
            userNameSnapshot: "CCTV Auto-Packing",
            userRoleSnapshot: "OWNER",
            reason: cctv_label_id
              ? `Konfirmasi packing otomatis dari kamera CCTV (Label #${cctv_label_id})`
              : "Konfirmasi packing otomatis dari kamera CCTV"

          }
        });
      }

    }

    // Update status packing di SalesRecord
    if (isPacked) {
      await prisma.salesRecord.update({
        where: { id: sales.id },
        data: {
          doPackingStatus: "sudah"
        }
      });
    }

    return NextResponse.json({
      saved: true,
      sales_record_id: sales.id,
      packing_status: isPacked ? "sudah" : "belum",
      cctv_label_id
    }, { status: 200 });

  } catch (error) {
    console.error("CCTV Sync Error:", error);
    return NextResponse.json({
      error: "Internal Server Error",
      saved: false,
      message: error instanceof Error ? error.message : "Terjadi kesalahan internal"
    }, { status: 500 });
  }
}
