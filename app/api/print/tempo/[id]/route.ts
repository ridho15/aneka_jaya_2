import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { formatTempoPaymentDotMatrix } from "@/lib/print/dotMatrix";
import { getTempoReceivable, listTempoPayments } from "@/lib/tempo/store";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getCurrentRole();
  if (!can(role, "tempo.view") && !can(role, "reports.finance_view")) {
    return Response.json({ success: false, message: "Tidak punya akses cetak Tempo." }, { status: 403 });
  }
  const { id } = await params;
  const receivable = await getTempoReceivable(id);
  if (!receivable) return Response.json({ success: false, message: "Tempo tidak ditemukan." }, { status: 404 });
  const payments = await listTempoPayments(id);
  return new Response(formatTempoPaymentDotMatrix({ receivable, payments }), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
