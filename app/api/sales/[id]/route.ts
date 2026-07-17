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
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
    const name = error instanceof Error ? error.name : "";
    if (code === "SALES_NOT_FOUND" || code === "P2025") {
      return NextResponse.json({ success: false, code: "SALES_NOT_FOUND", message: "Transaksi penjualan tidak ditemukan." }, { status: 404 });
    }
    if (code === "P2022") {
      return NextResponse.json({ success: false, code: "DATABASE_MIGRATION_REQUIRED", message: "Database belum memakai struktur penjualan terbaru. Jalankan migration lalu coba kembali." }, { status: 503 });
    }
    if (code.startsWith("P") || name.startsWith("Prisma")) {
      return NextResponse.json({ success: false, code: "DATABASE_ERROR", message: "Database gagal memperbarui transaksi penjualan." }, { status: 500 });
    }
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: error instanceof Error ? error.message : "Transaksi penjualan gagal diperbarui." }, { status: 400 });
  }
}
