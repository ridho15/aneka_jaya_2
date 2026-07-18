import { getSalesRecord } from "@/lib/sales/store";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { formatSaleDotMatrix, toEscPosPrn } from "@/lib/print/dotMatrix";
import { listAllRekeningAccounts } from "@/lib/business/masterData";
import { salesRekeningLabel } from "@/lib/sales/rekening";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getCurrentRole();
  if (!can(role, "reports.view") && !can(role, "penjualan.create")) {
    return Response.json({ success: false, message: "Tidak punya akses cetak penjualan." }, { status: 403 });
  }
  const { id } = await params;
  const sale = await getSalesRecord(id);
  if (!sale) return Response.json({ success: false, message: "Transaksi penjualan tidak ditemukan." }, { status: 404 });
  const rekeningNameSnapshot = salesRekeningLabel(sale, await listAllRekeningAccounts());
  const text = formatSaleDotMatrix({ ...sale, rekeningNameSnapshot }, { showTransactionNumber: role === "OWNER" });
  const isPrn = new URL(request.url).searchParams.get("format") === "prn";
  return new Response(isPrn ? toEscPosPrn(text) : text, {
    headers: {
      "content-type": isPrn ? "application/octet-stream" : "text/plain; charset=utf-8",
      ...(isPrn ? { "content-disposition": `attachment; filename="sales-${id}.prn"` } : {})
    }
  });
}
