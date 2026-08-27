import { getSalesRecordForUser } from "@/lib/sales/access";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { formatSaleDotMatrix, toEscPosPrn } from "@/lib/print/dotMatrix";
import { listAllRekeningAccounts } from "@/lib/business/masterData";
import { salesRekeningLabel } from "@/lib/sales/rekening";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const role = user.role;
  if (!can(role, "reports.view") && !can(role, "penjualan.create")) {
    return Response.json(
      { success: false, message: "Tidak punya akses cetak penjualan." },
      { status: 403 },
    );
  }
  const { id } = await params;
  const sale = await getSalesRecordForUser(id, user);
  if (!sale)
    return Response.json(
      { success: false, message: "Transaksi penjualan tidak ditemukan." },
      { status: 404 },
    );
  const rekeningNameSnapshot = salesRekeningLabel(
    sale,
    await listAllRekeningAccounts(),
  );
  const url = new URL(request.url);
  const layout =
    url.searchParams.get("layout") === "double" ? "double" : "single";
  const maxSingle =
    parseInt(url.searchParams.get("max_single") || "14", 10) || 14;
  const maxMulti =
    parseInt(url.searchParams.get("max_multi") || "18", 10) || 18;
  const text = formatSaleDotMatrix(
    { ...sale, rekeningNameSnapshot },
    {
      showTransactionNumber: role === "OWNER",
      itemLayout: layout,
      maxItemsSinglePage: maxSingle,
      maxItemsMultiPage: maxMulti,
    },
  );
  const isPrn = url.searchParams.get("format") === "prn";
  return new Response(isPrn ? toEscPosPrn(text) : text, {
    headers: {
      "content-type": isPrn
        ? "application/octet-stream"
        : "text/plain; charset=utf-8",
      ...(isPrn
        ? { "content-disposition": `attachment; filename="sales-${id}.prn"` }
        : {}),
    },
  });
}
