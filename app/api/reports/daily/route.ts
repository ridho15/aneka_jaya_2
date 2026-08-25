import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { jakartaDateFromKey } from "@/lib/date/jakarta";
import { getPaidSalesReport } from "@/lib/reports/store";
import { listTempoReceivables } from "@/lib/tempo/store";
import { generateDailyReportExcel } from "@/lib/reports/excelExport";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "reports.view")) {
    return Response.json(
      { success: false, message: "Tidak punya akses laporan harian." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date") || undefined;
  const format = url.searchParams.get("format") || "json";

  const selectedDate = jakartaDateFromKey(dateParam);
  const [summary, tempo] = await Promise.all([
    getPaidSalesReport(selectedDate),
    listTempoReceivables(),
  ]);
  const openTempo = tempo.filter(
    (row) => !["paid", "cancelled", "written_off"].includes(row.status),
  );

  if (format === "excel") {
    const xml = generateDailyReportExcel(summary, selectedDate, openTempo);
    const filename = `laporan-harian-${selectedDate}.xls`;

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
      openTempo,
      selectedDate,
    },
  });
}
