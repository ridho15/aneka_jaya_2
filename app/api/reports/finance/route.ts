import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { jakartaMonthFromKey } from "@/lib/date/jakarta";
import { getFinanceReport } from "@/lib/reports/store";
import { generateFinanceReportExcel } from "@/lib/reports/excelExport";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "reports.finance_view")) {
    return Response.json(
      { success: false, message: "Tidak punya akses laporan finance." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month") || undefined;
  const format = url.searchParams.get("format") || "json";

  const selectedMonth = jakartaMonthFromKey(monthParam);
  const summary = await getFinanceReport(selectedMonth);

  if (format === "excel") {
    const xml = generateFinanceReportExcel(summary, selectedMonth);
    const filename = `laporan-finance-${selectedMonth}.xls`;

    return new Response(xml, {
      headers: {
        "content-type": "application/vnd.ms-excel; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return Response.json({
    success: true,
    data: {
      summary,
      selectedMonth,
    },
  });
}
