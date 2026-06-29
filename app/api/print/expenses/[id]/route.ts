import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { getExpenseRecord } from "@/lib/expenses/store";
import { formatExpenseDotMatrix, toEscPosPrn } from "@/lib/print/dotMatrix";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getCurrentRole();
  if (!can(role, "pengeluaran.view") && !can(role, "reports.finance_view")) {
    return Response.json({ success: false, message: "Tidak punya akses cetak pengeluaran." }, { status: 403 });
  }
  const { id } = await params;
  const expense = await getExpenseRecord(id);
  if (!expense) return Response.json({ success: false, message: "Transaksi pengeluaran tidak ditemukan." }, { status: 404 });
  const text = formatExpenseDotMatrix(expense);
  const isPrn = new URL(request.url).searchParams.get("format") === "prn";
  return new Response(isPrn ? toEscPosPrn(text) : text, {
    headers: {
      "content-type": isPrn ? "application/octet-stream" : "text/plain; charset=utf-8",
      ...(isPrn ? { "content-disposition": `attachment; filename="expenses-${id}.prn"` } : {})
    }
  });
}
