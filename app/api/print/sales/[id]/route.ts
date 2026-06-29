import { getSalesRecord } from "@/lib/sales/store";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { formatSaleDotMatrix } from "@/lib/print/dotMatrix";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getCurrentRole();
  if (!can(role, "reports.view") && !can(role, "penjualan.create")) {
    return Response.json({ success: false, message: "Tidak punya akses cetak penjualan." }, { status: 403 });
  }
  const { id } = await params;
  const sale = await getSalesRecord(id);
  if (!sale) return Response.json({ success: false, message: "Transaksi penjualan tidak ditemukan." }, { status: 404 });
  return new Response(formatSaleDotMatrix(sale), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
