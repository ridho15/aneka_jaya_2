import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { jakartaDateKey } from "@/lib/date/jakarta";
import { getProductSalesReport } from "@/lib/reports/productReports";
import { generateProductReportExcel } from "@/lib/reports/excelExport";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "reports.view")) {
    return Response.json(
      { success: false, message: "Tidak punya akses laporan produk." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const today = jakartaDateKey(new Date());

  // Default: awal bulan ini s/d hari ini
  const [year, month] = today.split("-");
  const defaultStart = `${year}-${month}-01`;

  const startDate = url.searchParams.get("startDate") || defaultStart;
  const endDate = url.searchParams.get("endDate") || today;
  const keyword = url.searchParams.get("keyword") || undefined;
  const sku = url.searchParams.get("sku") || undefined;
  const format = url.searchParams.get("format") || "json";

  const report = await getProductSalesReport({
    startDate,
    endDate,
    productKeyword: keyword,
    sku,
  });

  if (format === "excel") {
    const xml = generateProductReportExcel(report);
    const filename = `laporan-produk-${startDate}-sd-${endDate}.xls`;

    return new Response(xml, {
      headers: {
        "content-type": "application/vnd.ms-excel; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return Response.json({ success: true, data: report });
}
