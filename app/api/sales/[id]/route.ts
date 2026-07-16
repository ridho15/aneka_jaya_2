import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { penjualanSchema } from "@/lib/validation/penjualanSchema";
import { updateSalesRecord } from "@/lib/sales/store";
import { getErpSyncSetting } from "@/lib/settings/erpSync";
import { retrySalesErpSync } from "@/lib/erpSync/salesRetry";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!can(await getCurrentRole(), "penjualan.manage")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses kelola Penjualan." }, { status: 403 });
  }
  const parsed = penjualanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Mohon lengkapi data penjualan yang wajib diisi.", code: "VALIDATION", details: parsed.error.flatten() }, { status: 400 });
  }
  const { id } = await params;
  try {
    const data = await updateSalesRecord(id, parsed.data);
    if (data.syncTarget === "erp" && data.syncStatus === "pending") {
      const setting = await getErpSyncSetting();
      if (setting.autoSyncAfterSalesEdit) {
        const autoSync = await retrySalesErpSync(id);
        return NextResponse.json({ success: true, data: autoSync.item || data, autoSync });
      }
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Transaksi penjualan gagal diperbarui." }, { status: 400 });
  }
}
