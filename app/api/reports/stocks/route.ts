import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getStockInventoryReport } from "@/lib/reports/stockReports";
import { generateStockReportExcel } from "@/lib/reports/excelExport";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "stock.view") && !can(user.role, "reports.view")) {
    return Response.json(
      { success: false, message: "Tidak punya akses laporan stok." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const warehouse = url.searchParams.get("warehouse") || undefined;
  const keyword = url.searchParams.get("keyword") || undefined;
  const sku = url.searchParams.get("sku") || undefined;
  const status = (url.searchParams.get("status") as any) || "all";
  const format = url.searchParams.get("format") || "json";

  const report = await getStockInventoryReport({
    warehouse,
    productKeyword: keyword,
    sku,
    status,
  });

  if (format === "excel") {
    const xml = generateStockReportExcel(report);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `laporan-stok-persediaan-${dateStr}.xls`;

    return new Response(xml, {
      headers: {
        "content-type": "application/vnd.ms-excel; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return Response.json({ success: true, data: report });
}
