import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentRole: vi.fn().mockResolvedValue("OWNER"),
  getCurrentUser: vi.fn().mockResolvedValue({ id: "owner-1", role: "OWNER", name: "Boss" }),
}));

vi.mock("@/lib/auth/roles", () => ({
  can: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/business/masterData", () => ({
  listBookkeepingTypes: vi.fn().mockResolvedValue([
    { id: "1", code: "W", name: "Walk In", isActive: true, sortOrder: 1 },
    { id: "2", code: "AJ", name: "Aneka Jaya", isActive: true, sortOrder: 2 },
  ]),
}));

vi.mock("@/lib/reports/customers", () => ({
  getCustomerSalesReport: vi.fn().mockResolvedValue({
    data: [
      {
        customerKey: "indah ask",
        customerName: "Indah Ask",
        locations: ["Jakarta"],
        primaryLocation: "Jakarta",
        totalOrders: 14,
        totalRevenue: 45000000,
        totalQuantity: 320,
        averageOrderValue: 3214285,
        firstOrderDate: "2026-07-01",
        lastOrderDate: "2026-09-10",
        hasOpenTempo: true,
        openTempoBalance: 5000000,
      },
      {
        customerKey: "sensen",
        customerName: "Sensen",
        locations: ["Toko"],
        primaryLocation: "Toko",
        totalOrders: 10,
        totalRevenue: 25000000,
        totalQuantity: 200,
        averageOrderValue: 2500000,
        firstOrderDate: "2026-07-04",
        lastOrderDate: "2026-09-12",
        hasOpenTempo: false,
        openTempoBalance: 0,
      },
    ],
    summary: {
      totalCustomers: 2,
      totalRevenue: 70000000,
      totalOrders: 24,
      averageRevenuePerCustomer: 35000000,
      topSpender: { name: "Indah Ask", revenue: 45000000 },
      mostFrequent: { name: "Indah Ask", orders: 14 },
    },
    meta: {
      page: 1,
      pageSize: 25,
      total: 2,
      totalPages: 1,
    },
  }),
}));

const { default: CustomerReportsPage } = await import("@/app/reports/customers/page");

describe("CustomerReportsPage UI", () => {
  it("renders customer report page with KPI cards and table", async () => {
    const pageElement = await CustomerReportsPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(pageElement);

    expect(html).toContain("Laporan Pelanggan");
    expect(html).toContain("Indah Ask");
    expect(html).toContain("Sensen");
    expect(html).toContain("5.000.000");
    expect(html).toContain("Lunas");
    expect(html).toContain("Omset Terbanyak (Rp Tertinggi)");
  });
});
