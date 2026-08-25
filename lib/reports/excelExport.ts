import type { ProductReportResult } from "./productReports";
import type { StockReportResult } from "./stockReports";
import type { PaidSalesReport, FinanceReportSummary } from "./summary";

function escapeXml(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const EXCEL_STYLES = `
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Borders/>
      <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#1E293B"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>
    <Style ss:ID="DocTitle">
      <Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#0F172A"/>
      <Alignment ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="SubTitle">
      <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#64748B"/>
      <Alignment ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="HeaderCell">
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#059669" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#047857"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#047857"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#047857"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#047857"/>
      </Borders>
    </Style>
    <Style ss:ID="DataLeft">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="DataCenter">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="DataNumber">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <NumberFormat ss:Format="#,##0"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="DataCurrency">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <NumberFormat ss:Format="&quot;Rp &quot;#,##0"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="TotalCell">
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#0F172A"/>
      <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <NumberFormat ss:Format="&quot;Rp &quot;#,##0"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#0F172A"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="TotalLabel">
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#0F172A"/>
      <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#0F172A"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="TotalNumber">
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#0F172A"/>
      <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <NumberFormat ss:Format="#,##0"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#0F172A"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="StatusSafe">
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#047857"/>
      <Interior ss:Color="#ECFDF5" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="StatusWarning">
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#B45309"/>
      <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="StatusOutOfStock">
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#B91C1C"/>
      <Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
  </Styles>
`;

export function generateProductReportExcel(report: ProductReportResult): string {
  const rows: string[] = [];

  // Header Title
  rows.push(`
    <Row ss:Height="24">
      <Cell ss:MergeAcross="7" ss:StyleID="DocTitle"><Data ss:Type="String">LAPORAN PENJUALAN PRODUK - ANEKA JAYA / SLM</Data></Cell>
    </Row>
    <Row ss:Height="18">
      <Cell ss:MergeAcross="7" ss:StyleID="SubTitle"><Data ss:Type="String">Periode: ${escapeXml(report.filter.startDate)} s/d ${escapeXml(report.filter.endDate)} | Dicetak pada: ${new Date().toLocaleString("id-ID")}</Data></Cell>
    </Row>
    <Row ss:Height="10"/>
  `);

  // Table Headers
  rows.push(`
    <Row ss:Height="26">
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">NO</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">KODE SKU</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">NAMA BARANG</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">QTY TERJUAL</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">SATUAN</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">JML TRANSAKSI</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">RATA-RATA HARGA</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">TOTAL OMSET</Data></Cell>
    </Row>
  `);

  // Data Rows
  report.items.forEach((item, index) => {
    rows.push(`
      <Row ss:Height="20">
        <Cell ss:StyleID="DataCenter"><Data ss:Type="Number">${index + 1}</Data></Cell>
        <Cell ss:StyleID="DataCenter"><Data ss:Type="String">${escapeXml(item.code)}</Data></Cell>
        <Cell ss:StyleID="DataLeft"><Data ss:Type="String">${escapeXml(item.name)}</Data></Cell>
        <Cell ss:StyleID="DataNumber"><Data ss:Type="Number">${item.totalQuantity}</Data></Cell>
        <Cell ss:StyleID="DataCenter"><Data ss:Type="String">${escapeXml(item.unit)}</Data></Cell>
        <Cell ss:StyleID="DataNumber"><Data ss:Type="Number">${item.transactionCount}</Data></Cell>
        <Cell ss:StyleID="DataCurrency"><Data ss:Type="Number">${item.avgPrice}</Data></Cell>
        <Cell ss:StyleID="DataCurrency"><Data ss:Type="Number">${item.totalOmset}</Data></Cell>
      </Row>
    `);
  });

  // Summary Row
  rows.push(`
    <Row ss:Height="22">
      <Cell ss:MergeAcross="2" ss:StyleID="TotalLabel"><Data ss:Type="String">GRAND TOTAL</Data></Cell>
      <Cell ss:StyleID="TotalNumber"><Data ss:Type="Number">${report.summary.totalQuantity}</Data></Cell>
      <Cell ss:StyleID="TotalLabel"><Data ss:Type="String">-</Data></Cell>
      <Cell ss:StyleID="TotalNumber"><Data ss:Type="Number">${report.summary.totalTransactionsCount}</Data></Cell>
      <Cell ss:StyleID="TotalLabel"><Data ss:Type="String">-</Data></Cell>
      <Cell ss:StyleID="TotalCell"><Data ss:Type="Number">${report.summary.totalOmset}</Data></Cell>
    </Row>
  `);

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  ${EXCEL_STYLES}
  <Worksheet ss:Name="Laporan Penjualan Produk">
    <Table>
      <Column ss:Width="35"/>
      <Column ss:Width="90"/>
      <Column ss:Width="220"/>
      <Column ss:Width="80"/>
      <Column ss:Width="65"/>
      <Column ss:Width="95"/>
      <Column ss:Width="110"/>
      <Column ss:Width="130"/>
      ${rows.join("\n")}
    </Table>
  </Worksheet>
</Workbook>`;
}

export function generateStockReportExcel(report: StockReportResult): string {
  const rows: string[] = [];

  // Header Title
  rows.push(`
    <Row ss:Height="24">
      <Cell ss:MergeAcross="8" ss:StyleID="DocTitle"><Data ss:Type="String">LAPORAN PERSEDIAAN STOK BARANG - ANEKA JAYA / SLM</Data></Cell>
    </Row>
    <Row ss:Height="18">
      <Cell ss:MergeAcross="8" ss:StyleID="SubTitle"><Data ss:Type="String">Gudang: ${escapeXml(report.filter.warehouse || "Semua Gudang")} | Status: ${escapeXml(report.filter.status || "Semua")} | Waktu Cetak: ${new Date().toLocaleString("id-ID")}</Data></Cell>
    </Row>
    <Row ss:Height="10"/>
  `);

  // Table Headers
  rows.push(`
    <Row ss:Height="26">
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">NO</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">KODE SKU</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">NAMA BARANG</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">GUDANG / RAK</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">QTY FISIK</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">MIN STOK</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">STATUS</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">HARGA MODAL</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">VALUASI ASET</Data></Cell>
    </Row>
  `);

  // Data Rows
  report.items.forEach((item, index) => {
    const statusStyle =
      item.status === "out_of_stock"
        ? "StatusOutOfStock"
        : item.status === "warning"
        ? "StatusWarning"
        : "StatusSafe";

    const statusText =
      item.status === "out_of_stock"
        ? "HABIS"
        : item.status === "warning"
        ? "MENIPIS"
        : "AMAN";

    const costPriceCell =
      item.costPrice > 0
        ? `<Cell ss:StyleID="DataCurrency"><Data ss:Type="Number">${item.costPrice}</Data></Cell>`
        : `<Cell ss:StyleID="DataCenter"><Data ss:Type="String">-</Data></Cell>`;

    const valuationCell =
      item.totalCostValuation > 0
        ? `<Cell ss:StyleID="DataCurrency"><Data ss:Type="Number">${item.totalCostValuation}</Data></Cell>`
        : `<Cell ss:StyleID="DataCenter"><Data ss:Type="String">-</Data></Cell>`;

    rows.push(`
      <Row ss:Height="20">
        <Cell ss:StyleID="DataCenter"><Data ss:Type="Number">${index + 1}</Data></Cell>
        <Cell ss:StyleID="DataCenter"><Data ss:Type="String">${escapeXml(item.sku)}</Data></Cell>
        <Cell ss:StyleID="DataLeft"><Data ss:Type="String">${escapeXml(item.productName)}</Data></Cell>
        <Cell ss:StyleID="DataCenter"><Data ss:Type="String">${escapeXml(item.warehouse)} (${escapeXml(item.rack)})</Data></Cell>
        <Cell ss:StyleID="DataNumber"><Data ss:Type="Number">${item.quantity}</Data></Cell>
        <Cell ss:StyleID="DataNumber"><Data ss:Type="Number">${item.minStock}</Data></Cell>
        <Cell ss:StyleID="${statusStyle}"><Data ss:Type="String">${statusText}</Data></Cell>
        ${costPriceCell}
        ${valuationCell}
      </Row>
    `);
  });

  // Summary Row
  const totalValuationCell =
    report.summary.totalCostValuation > 0
      ? `<Cell ss:StyleID="TotalCell"><Data ss:Type="Number">${report.summary.totalCostValuation}</Data></Cell>`
      : `<Cell ss:StyleID="TotalLabel"><Data ss:Type="String">-</Data></Cell>`;

  rows.push(`
    <Row ss:Height="22">
      <Cell ss:MergeAcross="3" ss:StyleID="TotalLabel"><Data ss:Type="String">TOTAL PERSEDIAAN</Data></Cell>
      <Cell ss:StyleID="TotalNumber"><Data ss:Type="Number">${report.summary.totalQuantity}</Data></Cell>
      <Cell ss:MergeAcross="2" ss:StyleID="TotalLabel"><Data ss:Type="String">-</Data></Cell>
      ${totalValuationCell}
    </Row>
  `);

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  ${EXCEL_STYLES}
  <Worksheet ss:Name="Laporan Persediaan Stok">
    <Table>
      <Column ss:Width="35"/>
      <Column ss:Width="90"/>
      <Column ss:Width="200"/>
      <Column ss:Width="120"/>
      <Column ss:Width="70"/>
      <Column ss:Width="65"/>
      <Column ss:Width="75"/>
      <Column ss:Width="95"/>
      <Column ss:Width="120"/>
      ${rows.join("\n")}
    </Table>
  </Worksheet>
</Workbook>`;
}

export function generateDailyReportExcel(
  summary: PaidSalesReport,
  selectedDate: string,
  openTempo: any[] = [],
): string {
  const rows: string[] = [];

  // Header Title
  rows.push(`
    <Row ss:Height="24">
      <Cell ss:MergeAcross="6" ss:StyleID="DocTitle"><Data ss:Type="String">LAPORAN PENERIMAAN HARIAN - ANEKA JAYA / SLM</Data></Cell>
    </Row>
    <Row ss:Height="18">
      <Cell ss:MergeAcross="6" ss:StyleID="SubTitle"><Data ss:Type="String">Tanggal: ${escapeXml(selectedDate)} | Dicetak pada: ${new Date().toLocaleString("id-ID")}</Data></Cell>
    </Row>
    <Row ss:Height="10"/>
  `);

  // Ringkasan Kas
  rows.push(`
    <Row ss:Height="22">
      <Cell ss:MergeAcross="1" ss:StyleID="TotalLabel"><Data ss:Type="String">METODE PENERIMAAN</Data></Cell>
      <Cell ss:MergeAcross="1" ss:StyleID="TotalLabel"><Data ss:Type="String">TOTAL DITERIMA</Data></Cell>
    </Row>
    <Row ss:Height="20">
      <Cell ss:MergeAcross="1" ss:StyleID="DataLeft"><Data ss:Type="String">Penerimaan Tunai (Cash)</Data></Cell>
      <Cell ss:MergeAcross="1" ss:StyleID="DataCurrency"><Data ss:Type="Number">${summary.totalCash}</Data></Cell>
    </Row>
    <Row ss:Height="20">
      <Cell ss:MergeAcross="1" ss:StyleID="DataLeft"><Data ss:Type="String">Penerimaan Transfer Bank (TF)</Data></Cell>
      <Cell ss:MergeAcross="1" ss:StyleID="DataCurrency"><Data ss:Type="Number">${summary.totalTf}</Data></Cell>
    </Row>
    <Row ss:Height="20">
      <Cell ss:MergeAcross="1" ss:StyleID="DataLeft"><Data ss:Type="String">Pelunasan Piutang Tempo</Data></Cell>
      <Cell ss:MergeAcross="1" ss:StyleID="DataCurrency"><Data ss:Type="Number">${summary.tempoPaymentTotal}</Data></Cell>
    </Row>
    <Row ss:Height="22">
      <Cell ss:MergeAcross="1" ss:StyleID="TotalLabel"><Data ss:Type="String">GRAND TOTAL PENERIMAAN</Data></Cell>
      <Cell ss:MergeAcross="1" ss:StyleID="TotalCell"><Data ss:Type="Number">${summary.grandTotal}</Data></Cell>
    </Row>
    <Row ss:Height="15"/>
  `);

  // Section 1: Rincian Penjualan Lunas
  rows.push(`
    <Row ss:Height="22">
      <Cell ss:MergeAcross="6" ss:StyleID="DocTitle"><Data ss:Type="String">RINCIAN PENJUALAN LUNAS</Data></Cell>
    </Row>
    <Row ss:Height="26">
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">NO</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">WAKTU</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">CUSTOMER</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">TIPE</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">METODE</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">REKENING</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">TOTAL</Data></Cell>
    </Row>
  `);

  summary.paidSales.forEach((sale, index) => {
    rows.push(`
      <Row ss:Height="20">
        <Cell ss:StyleID="DataCenter"><Data ss:Type="Number">${index + 1}</Data></Cell>
        <Cell ss:StyleID="DataCenter"><Data ss:Type="String">${escapeXml(sale.saleDate)}</Data></Cell>
        <Cell ss:StyleID="DataLeft"><Data ss:Type="String">${escapeXml(sale.customerName)}</Data></Cell>
        <Cell ss:StyleID="DataCenter"><Data ss:Type="String">${escapeXml(sale.tipeCodeSnapshot || "-")}</Data></Cell>
        <Cell ss:StyleID="DataCenter"><Data ss:Type="String">${escapeXml(sale.paymentMethod)}</Data></Cell>
        <Cell ss:StyleID="DataLeft"><Data ss:Type="String">${escapeXml(sale.initialPaymentRekeningNameSnapshot || "-")}</Data></Cell>
        <Cell ss:StyleID="DataCurrency"><Data ss:Type="Number">${sale.total}</Data></Cell>
      </Row>
    `);
  });

  if (summary.paidSales.length === 0) {
    rows.push(`
      <Row ss:Height="20">
        <Cell ss:MergeAcross="6" ss:StyleID="DataCenter"><Data ss:Type="String">Tidak ada transaksi penjualan lunas pada tanggal ini.</Data></Cell>
      </Row>
    `);
  }

  // Section 2: Rincian Pembayaran Tempo
  if (summary.tempoPayments && summary.tempoPayments.length > 0) {
    rows.push(`
      <Row ss:Height="15"/>
      <Row ss:Height="22">
        <Cell ss:MergeAcross="6" ss:StyleID="DocTitle"><Data ss:Type="String">RINCIAN PEMBAYARAN TEMPO</Data></Cell>
      </Row>
      <Row ss:Height="26">
        <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">NO</Data></Cell>
        <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">WAKTU</Data></Cell>
        <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">CUSTOMER</Data></Cell>
        <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">METODE</Data></Cell>
        <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">REKENING</Data></Cell>
        <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">CATATAN</Data></Cell>
        <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">JUMLAH DITERIMA</Data></Cell>
      </Row>
    `);

    summary.tempoPayments.forEach((p, idx) => {
      rows.push(`
        <Row ss:Height="20">
          <Cell ss:StyleID="DataCenter"><Data ss:Type="Number">${idx + 1}</Data></Cell>
          <Cell ss:StyleID="DataCenter"><Data ss:Type="String">${escapeXml(p.paymentDate)}</Data></Cell>
          <Cell ss:StyleID="DataLeft"><Data ss:Type="String">${escapeXml(p.customerName || "-")}</Data></Cell>
          <Cell ss:StyleID="DataCenter"><Data ss:Type="String">${escapeXml(p.paymentMethod)}</Data></Cell>
          <Cell ss:StyleID="DataLeft"><Data ss:Type="String">${escapeXml(p.rekeningNameSnapshot || "-")}</Data></Cell>
          <Cell ss:StyleID="DataLeft"><Data ss:Type="String">${escapeXml(p.notes || "-")}</Data></Cell>
          <Cell ss:StyleID="DataCurrency"><Data ss:Type="Number">${p.amountPaid}</Data></Cell>
        </Row>
      `);
    });
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  ${EXCEL_STYLES}
  <Worksheet ss:Name="Laporan Penerimaan Harian">
    <Table>
      <Column ss:Width="35"/>
      <Column ss:Width="85"/>
      <Column ss:Width="160"/>
      <Column ss:Width="65"/>
      <Column ss:Width="75"/>
      <Column ss:Width="140"/>
      <Column ss:Width="120"/>
      ${rows.join("\n")}
    </Table>
  </Worksheet>
</Workbook>`;
}

export function generateFinanceReportExcel(
  summary: FinanceReportSummary,
  selectedMonth: string,
): string {
  const rows: string[] = [];

  // Header Title
  rows.push(`
    <Row ss:Height="24">
      <Cell ss:MergeAcross="6" ss:StyleID="DocTitle"><Data ss:Type="String">LAPORAN FINANCE BULANAN - ANEKA JAYA / SLM</Data></Cell>
    </Row>
    <Row ss:Height="18">
      <Cell ss:MergeAcross="6" ss:StyleID="SubTitle"><Data ss:Type="String">Bulan: ${escapeXml(selectedMonth)} | Dicetak pada: ${new Date().toLocaleString("id-ID")}</Data></Cell>
    </Row>
    <Row ss:Height="10"/>
  `);

  // Ringkasan Eksekutif Keuangan
  rows.push(`
    <Row ss:Height="22">
      <Cell ss:MergeAcross="1" ss:StyleID="TotalLabel"><Data ss:Type="String">INDIKATOR KEUANGAN</Data></Cell>
      <Cell ss:MergeAcross="1" ss:StyleID="TotalLabel"><Data ss:Type="String">NILAI RUPIAH</Data></Cell>
    </Row>
    <Row ss:Height="20">
      <Cell ss:MergeAcross="1" ss:StyleID="DataLeft"><Data ss:Type="String">Open Tempo Aktif (Piutang Berjalan)</Data></Cell>
      <Cell ss:MergeAcross="1" ss:StyleID="DataCurrency"><Data ss:Type="Number">${summary.openTempoTotal}</Data></Cell>
    </Row>
    <Row ss:Height="20">
      <Cell ss:MergeAcross="1" ss:StyleID="DataLeft"><Data ss:Type="String">Pembayaran Tempo Diterima Bulan Ini</Data></Cell>
      <Cell ss:MergeAcross="1" ss:StyleID="DataCurrency"><Data ss:Type="Number">${summary.tempoPaymentTotal}</Data></Cell>
    </Row>
    <Row ss:Height="20">
      <Cell ss:MergeAcross="1" ss:StyleID="DataLeft"><Data ss:Type="String">Pengeluaran Operasional Approved</Data></Cell>
      <Cell ss:MergeAcross="1" ss:StyleID="DataCurrency"><Data ss:Type="Number">${summary.approvedExpenseTotal}</Data></Cell>
    </Row>
    <Row ss:Height="15"/>
  `);

  // Section 1: Pengeluaran Approved
  rows.push(`
    <Row ss:Height="22">
      <Cell ss:MergeAcross="6" ss:StyleID="DocTitle"><Data ss:Type="String">RINCIAN PENGELUARAN APPROVED</Data></Cell>
    </Row>
    <Row ss:Height="26">
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">NO</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">TANGGAL</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">VENDOR / PENERIMA</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">KATEGORI</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">COA AKUN</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">DESKRIPSI</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">JUMLAH</Data></Cell>
    </Row>
  `);

  summary.approvedExpenses.forEach((exp, idx) => {
    rows.push(`
      <Row ss:Height="20">
        <Cell ss:StyleID="DataCenter"><Data ss:Type="Number">${idx + 1}</Data></Cell>
        <Cell ss:StyleID="DataCenter"><Data ss:Type="String">${escapeXml(exp.expenseDate)}</Data></Cell>
        <Cell ss:StyleID="DataLeft"><Data ss:Type="String">${escapeXml(exp.vendorName)}</Data></Cell>
        <Cell ss:StyleID="DataCenter"><Data ss:Type="String">${escapeXml(exp.category)}</Data></Cell>
        <Cell ss:StyleID="DataLeft"><Data ss:Type="String">${escapeXml(exp.coaNameSnapshot || "-")}</Data></Cell>
        <Cell ss:StyleID="DataLeft"><Data ss:Type="String">${escapeXml(exp.description)}</Data></Cell>
        <Cell ss:StyleID="DataCurrency"><Data ss:Type="Number">${exp.amount}</Data></Cell>
      </Row>
    `);
  });

  if (summary.approvedExpenses.length > 0) {
    rows.push(`
      <Row ss:Height="22">
        <Cell ss:MergeAcross="5" ss:StyleID="TotalLabel"><Data ss:Type="String">TOTAL PENGELUARAN APPROVED</Data></Cell>
        <Cell ss:StyleID="TotalCell"><Data ss:Type="Number">${summary.approvedExpenseTotal}</Data></Cell>
      </Row>
    `);
  } else {
    rows.push(`
      <Row ss:Height="20">
        <Cell ss:MergeAcross="6" ss:StyleID="DataCenter"><Data ss:Type="String">Tidak ada pengeluaran approved pada bulan ini.</Data></Cell>
      </Row>
    `);
  }

  // Section 2: Open Tempo
  if (summary.openTempo.length > 0) {
    rows.push(`
      <Row ss:Height="15"/>
      <Row ss:Height="22">
        <Cell ss:MergeAcross="6" ss:StyleID="DocTitle"><Data ss:Type="String">RINCIAN PIUTANG TEMPO AKTIF (OPEN TEMPO)</Data></Cell>
      </Row>
      <Row ss:Height="26">
        <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">NO</Data></Cell>
        <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">TANGGAL TRANSAKSI</Data></Cell>
        <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">CUSTOMER</Data></Cell>
        <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">JATUH TEMPO</Data></Cell>
        <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">STATUS</Data></Cell>
        <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">TOTAL TAGIHAN</Data></Cell>
        <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">SISA PIUTANG</Data></Cell>
      </Row>
    `);

    summary.openTempo.forEach((t, idx) => {
      rows.push(`
        <Row ss:Height="20">
          <Cell ss:StyleID="DataCenter"><Data ss:Type="Number">${idx + 1}</Data></Cell>
          <Cell ss:StyleID="DataCenter"><Data ss:Type="String">${escapeXml(t.transactionDate)}</Data></Cell>
          <Cell ss:StyleID="DataLeft"><Data ss:Type="String">${escapeXml(t.customerName)}</Data></Cell>
          <Cell ss:StyleID="DataCenter"><Data ss:Type="String">${escapeXml(t.dueDate)}</Data></Cell>
          <Cell ss:StyleID="DataCenter"><Data ss:Type="String">${escapeXml(t.status)}</Data></Cell>
          <Cell ss:StyleID="DataCurrency"><Data ss:Type="Number">${t.originalAmount}</Data></Cell>
          <Cell ss:StyleID="DataCurrency"><Data ss:Type="Number">${t.remainingAmount}</Data></Cell>
        </Row>
      `);
    });

    rows.push(`
      <Row ss:Height="22">
        <Cell ss:MergeAcross="5" ss:StyleID="TotalLabel"><Data ss:Type="String">TOTAL SISA PIUTANG TEMPO</Data></Cell>
        <Cell ss:StyleID="TotalCell"><Data ss:Type="Number">${summary.openTempoTotal}</Data></Cell>
      </Row>
    `);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  ${EXCEL_STYLES}
  <Worksheet ss:Name="Laporan Finance Bulanan">
    <Table>
      <Column ss:Width="35"/>
      <Column ss:Width="85"/>
      <Column ss:Width="160"/>
      <Column ss:Width="100"/>
      <Column ss:Width="130"/>
      <Column ss:Width="180"/>
      <Column ss:Width="130"/>
      ${rows.join("\n")}
    </Table>
  </Worksheet>
</Workbook>`;
}

