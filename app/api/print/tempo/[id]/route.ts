import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { formatTempoPaymentDotMatrix, toEscPosPrn } from "@/lib/print/dotMatrix";
import { getTempoReceivable, listTempoPayments } from "@/lib/tempo/store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getCurrentRole();
  if (!can(role, "tempo.view") && !can(role, "reports.finance_view")) {
    return Response.json({ success: false, message: "Tidak punya akses cetak Tempo." }, { status: 403 });
  }
  const { id } = await params;
  const receivable = await getTempoReceivable(id);
  if (!receivable) return Response.json({ success: false, message: "Tempo tidak ditemukan." }, { status: 404 });
  const payments = await listTempoPayments(id);
  const text = formatTempoPaymentDotMatrix({ receivable, payments });
  const isPrn = new URL(request.url).searchParams.get("format") === "prn";
  return new Response(isPrn ? toEscPosPrn(text) : text, {
    headers: {
      "content-type": isPrn ? "application/octet-stream" : "text/plain; charset=utf-8",
      ...(isPrn ? { "content-disposition": `attachment; filename="tempo-${id}.prn"` } : {})
    }
  });
}
