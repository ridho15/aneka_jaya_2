import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("@/components/layout/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

const mocks = vi.hoisted(() => ({
  getCurrentRole: vi.fn(),
  getCurrentUser: vi.fn(),
  listProducts: vi.fn(),
  listSalesRecords: vi.fn(),
  listExpenseRecords: vi.fn(),
  listTempoReceivables: vi.fn(),
  listAudit: vi.fn(),
  listRekeningAccounts: vi.fn(),
  getOperationalProfitSetting: vi.fn(),
  getOpenCloudStatus: vi.fn(),
  getWhatsappProviderStatus: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentRole: mocks.getCurrentRole, getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/api/products", () => ({ listProducts: mocks.listProducts }));
vi.mock("@/lib/sales/store", () => ({ listSalesRecords: mocks.listSalesRecords }));
vi.mock("@/lib/expenses/store", () => ({ listExpenseRecords: mocks.listExpenseRecords }));
vi.mock("@/lib/tempo/store", () => ({ listTempoReceivables: mocks.listTempoReceivables }));
vi.mock("@/lib/audit/store", () => ({ listAudit: mocks.listAudit }));
vi.mock("@/lib/business/masterData", () => ({ listRekeningAccounts: mocks.listRekeningAccounts }));
vi.mock("@/lib/settings/profit", () => ({ getOperationalProfitSetting: mocks.getOperationalProfitSetting }));
vi.mock("@/lib/opencloud/auth", () => ({ getOpenCloudStatus: mocks.getOpenCloudStatus }));
vi.mock("@/lib/whatsapp/whatsappClient", () => ({ getWhatsappProviderStatus: mocks.getWhatsappProviderStatus }));

const { default: DashboardPage } = await import("@/app/dashboard/page");
const { ROLE_PERMISSIONS } = await import("@/lib/auth/roles");

describe("DashboardPage data source notice", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    mocks.getCurrentRole.mockResolvedValue("OWNER");
    mocks.getCurrentUser.mockResolvedValue({ name: "Owner" });
    mocks.listProducts.mockResolvedValue({ success: true, data: [] });
    mocks.listSalesRecords.mockResolvedValue([]);
    mocks.listExpenseRecords.mockResolvedValue([]);
    mocks.listTempoReceivables.mockResolvedValue([]);
    mocks.listAudit.mockResolvedValue([]);
    mocks.listRekeningAccounts.mockResolvedValue([]);
    mocks.getOperationalProfitSetting.mockResolvedValue({ grossProfitPercent: 20 });
    mocks.getOpenCloudStatus.mockReturnValue({ configured: false, message: "OpenCloud belum dikonfigurasi." });
    mocks.getWhatsappProviderStatus.mockReturnValue({ ready: false, message: "WhatsApp belum dikonfigurasi." });
  });

  it("shows a data source notice outside production mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "development");

    const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("Mode development: dashboard dapat membaca gabungan DB dan JSON lokal.");
  });

  it("hides the data source notice in production mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "production");

    const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) }));

    expect(html).not.toContain("Mode development: dashboard dapat membaca gabungan DB dan JSON lokal.");
  });

  it("renders dynamic operational profit cards from non-AJ sales, expenses, and setting", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "production");
    mocks.listSalesRecords.mockResolvedValue([
      { id: "W-1", saleDate: "2026-07-08", tipeId: "W", tipeCodeSnapshot: "W", customerName: "Customer", paymentMethod: "Cash", total: 1_000_000, approvalStatus: "approved", items: [] },
      { id: "SLM-1", saleDate: "2026-07-08", tipeId: "SLM", tipeCodeSnapshot: "SLM", customerName: "Customer", paymentMethod: "Cash", total: 1_000_000, approvalStatus: "approved", items: [] },
      { id: "ONLINE-1", saleDate: "2026-07-08", tipeId: "ONLINE", tipeCodeSnapshot: "ONLINE", customerName: "Customer", paymentMethod: "Cash", total: 1_000_000, approvalStatus: "approved", items: [] },
      { id: "AJ-1", saleDate: "2026-07-08", tipeId: "AJ", tipeCodeSnapshot: "AJ", customerName: "Customer", paymentMethod: "Cash", total: 9_000_000, approvalStatus: "approved", items: [] }
    ]);
    mocks.listExpenseRecords.mockResolvedValue([
      { id: "EXP-W", expenseDate: "2026-07-08", tipeId: "W", tipeCodeSnapshot: "W", amount: 100_000, approvalStatus: "approved", category: "Operasional", vendorName: "Vendor", description: "Biaya", paymentMethod: "Cash" }
    ]);

    const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("Profit Operasional");
    expect(html).toContain("Gross Profit 20%");
    expect(html).toContain("Nett Profit Operasional");
    expect(html).not.toContain("Profit SLM");
  });

  it("hides operational profit for non-owner dashboard viewers and does not read profit settings", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "production");
    mocks.getCurrentRole.mockResolvedValue("ADMIN");
    mocks.getOperationalProfitSetting.mockClear();
    ROLE_PERMISSIONS.ADMIN.push("dashboard.view");
    try {
      const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) }));

      expect(html).not.toContain("Profit Operasional");
      expect(html).not.toContain("Gross Profit Operasional");
      expect(html).not.toContain("Nett Profit Operasional");
      expect(html).not.toContain("/settings/profit-slm");
      expect(mocks.getOperationalProfitSetting).not.toHaveBeenCalled();
    } finally {
      ROLE_PERMISSIONS.ADMIN = ROLE_PERMISSIONS.ADMIN.filter((permission) => permission !== "dashboard.view");
    }
  });
});
