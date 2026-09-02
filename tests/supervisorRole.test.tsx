import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  can,
  landingPageForRole,
  parseRole,
  ROLES,
  roleLabel,
} from "@/lib/auth/roles";
import { visibleNavGroups, visibleNavLinks } from "@/components/layout/navigation";
import { SupervisorStockDashboard } from "@/components/dashboard/SupervisorStockDashboard";
import type { StockReportItem } from "@/lib/reports/stockReports";

describe("Supervisor Role and Access Control", () => {
  it("includes SUPERVISOR in ROLES list with label Supervisor", () => {
    expect(ROLES).toContain("SUPERVISOR");
    expect(roleLabel("SUPERVISOR")).toBe("Supervisor");
  });

  it("parses role case-insensitively", () => {
    expect(parseRole("supervisor")).toBe("SUPERVISOR");
    expect(parseRole("Supervisor")).toBe("SUPERVISOR");
    expect(parseRole("SUPERVISOR")).toBe("SUPERVISOR");
    expect(parseRole("owner")).toBe("OWNER");
    expect(parseRole("unknown_role")).toBe("VIEWER");
  });

  it("sets /dashboard as the landing page for SUPERVISOR", () => {
    expect(landingPageForRole("SUPERVISOR")).toBe("/dashboard");
  });

  it("allows SUPERVISOR to access operational modules", () => {
    expect(can("SUPERVISOR", "dashboard.view")).toBe(true);
    expect(can("SUPERVISOR", "penjualan.create")).toBe(true);
    expect(can("SUPERVISOR", "penjualan.manage")).toBe(true);
    expect(can("SUPERVISOR", "pengeluaran.view")).toBe(true);
    expect(can("SUPERVISOR", "pengeluaran.create")).toBe(true);
    expect(can("SUPERVISOR", "stock.view")).toBe(true);
    expect(can("SUPERVISOR", "stock.manage")).toBe(true);
    expect(can("SUPERVISOR", "tempo.view")).toBe(true);
    expect(can("SUPERVISOR", "tempo.mark_paid")).toBe(true);
    expect(can("SUPERVISOR", "approval.view")).toBe(true);
    expect(can("SUPERVISOR", "approval.approve")).toBe(true);
    expect(can("SUPERVISOR", "audit.view")).toBe(true);
    expect(can("SUPERVISOR", "erp_sync.retry")).toBe(true);
    expect(can("SUPERVISOR", "settings.view")).toBe(true);
    expect(can("SUPERVISOR", "guide.view")).toBe(true);
  });

  it("strictly forbids SUPERVISOR from accessing Pusat Laporan", () => {
    expect(can("SUPERVISOR", "reports.view")).toBe(false);
    expect(can("SUPERVISOR", "reports.finance_view")).toBe(false);
  });

  it("does not render PUSAT LAPORAN category in visible navigation for SUPERVISOR, but includes AI Prediksi Stok in OPERASIONAL", () => {
    const groups = visibleNavGroups("SUPERVISOR");
    const groupCategories = groups.map((g) => g.category);
    expect(groupCategories).not.toContain("PUSAT LAPORAN");
    expect(groupCategories).toContain("MENU UTAMA");
    expect(groupCategories).toContain("OPERASIONAL & TRANSAKSI");
    expect(groupCategories).toContain("SISTEM & MONITORING");

    const links = visibleNavLinks("SUPERVISOR");
    const linkHrefs = links.map((l) => l.href);
    expect(linkHrefs).toContain("/stok-barang/ai-forecast");
    expect(linkHrefs).not.toContain("/reports");
    expect(linkHrefs).not.toContain("/reports/products");
    expect(linkHrefs).not.toContain("/reports/stocks");
    expect(linkHrefs).not.toContain("/reports/finance");
  });

  it("renders Supervisor Stock Depletion Dashboard with 4 health KPI cards and operational shortcuts", () => {
    const mockItems: StockReportItem[] = [
      {
        productId: "SKU-OUT",
        sku: "SKU-OUT",
        productName: "Barang Habis Total",
        warehouse: "Gudang Utama",
        rack: "Rak A1",
        unit: "PCS",
        minStock: 10,
        quantity: 0,
        costPrice: 50_000,
        sellPrice: 75_000,
        totalCostValuation: 0,
        totalSellValuation: 0,
        status: "out_of_stock"
      },
      {
        productId: "SKU-LOW",
        sku: "SKU-LOW",
        productName: "Barang Menipis",
        warehouse: "Gudang Utama",
        rack: "Rak A2",
        unit: "PCS",
        minStock: 20,
        quantity: 5,
        costPrice: 20_000,
        sellPrice: 30_000,
        totalCostValuation: 100_000,
        totalSellValuation: 150_000,
        status: "warning"
      },
      {
        productId: "SKU-SAFE",
        sku: "SKU-SAFE",
        productName: "Barang Aman",
        warehouse: "Gudang Utama",
        rack: "Rak A3",
        unit: "PCS",
        minStock: 10,
        quantity: 100,
        costPrice: 10_000,
        sellPrice: 15_000,
        totalCostValuation: 1_000_000,
        totalSellValuation: 1_500_000,
        status: "safe"
      }
    ];

    const html = renderToStaticMarkup(
      <SupervisorStockDashboard
        userName="Budi Supervisor"
        stockItems={mockItems}
        warehouses={["Gudang Utama"]}
      />
    );

    expect(html).toContain("Budi Supervisor");
    expect(html).toContain("Stok Habis (0 Unit)");
    expect(html).toContain("Stok Menipis");
    expect(html).toContain("Total Item Dipantau");
    expect(html).toContain("Valuasi Barang Kritis");
    expect(html).toContain("Barang Habis Total");
    expect(html).toContain("Barang Menipis");
    expect(html).toContain("/penjualan/input");
    expect(html).toContain("/pengeluaran/input");
    expect(html).toContain("/tempo");
    expect(html).toContain("/approval");
    expect(html).toContain("/stok-barang/SKU-OUT");
  });
});
