import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit/store";
import { inventoryErrorBody } from "@/lib/inventory/errors";
import { importInventoryFromErp } from "@/lib/inventory/erpImport";

export const maxDuration = 300;

/** Impor awal (cutover) master barang, gudang, dan saldo stok dari Anika ERP. Khusus Super Admin. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user.role !== "OWNER") return NextResponse.json({ success: false, message: "Hanya Super Admin yang dapat mengimpor stok dari ERP.", code: "FORBIDDEN" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean; maxPages?: number };
  try {
    const summary = await importInventoryFromErp({ dryRun: body.dryRun !== false, maxPages: body.maxPages }, { id: user.id, name: user.name });
    await recordAudit({ entityType: "stock", entityId: "erp-import", action: "create", afterValue: { ...summary, skipped: summary.skipped.length }, reason: `Impor stok dari ERP${summary.dryRun ? " (dry run)" : ""} oleh ${user.name}` }).catch(() => undefined);
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    const { status, body: errorBody } = inventoryErrorBody(error);
    return NextResponse.json(errorBody, { status });
  }
}
