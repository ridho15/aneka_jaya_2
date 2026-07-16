import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("@/components/layout/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/transactions/TransactionCancelButton", () => ({ TransactionCancelButton: () => null }));

const mocks = vi.hoisted(() => ({
  getCurrentRole: vi.fn(),
  listSalesRecordsPage: vi.fn(),
  listBookkeepingTypes: vi.fn(),
  listRekeningAccounts: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentRole: mocks.getCurrentRole }));
vi.mock("@/lib/sales/store", () => ({ listSalesRecordsPage: mocks.listSalesRecordsPage }));
vi.mock("@/lib/business/masterData", () => ({ listBookkeepingTypes: mocks.listBookkeepingTypes, listRekeningAccounts: mocks.listRekeningAccounts }));

const { default: PenjualanHistoryPage } = await import("@/app/penjualan/page");

describe("PenjualanHistoryPage filters", () => {
  beforeEach(() => {
    mocks.getCurrentRole.mockResolvedValue("OWNER");
    mocks.listSalesRecordsPage.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 10, total: 0, totalPages: 1 } });
    mocks.listRekeningAccounts.mockResolvedValue([]);
    mocks.listBookkeepingTypes.mockResolvedValue([
      { id: "W", code: "W", name: "Walk In", isActive: true, sortOrder: 1 },
      { id: "AJ", code: "AJ", name: "Aneka Jaya", isActive: true, sortOrder: 2 },
      { id: "SLM", code: "SLM", name: "SLM", isActive: true, sortOrder: 3 },
      { id: "ONLINE", code: "ONLINE", name: "Online", isActive: true, sortOrder: 4 },
      { id: "OLD", code: "OLD", name: "Old", isActive: false, sortOrder: 5 }
    ]);
  });

  it("renders active master bookkeeping types in the Tipe filter", async () => {
    const html = renderToStaticMarkup(await PenjualanHistoryPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain('<option value="W">W</option>');
    expect(html).toContain('<option value="AJ">AJ</option>');
    expect(html).toContain('<option value="SLM">SLM</option>');
    expect(html).toContain('<option value="ONLINE">ONLINE</option>');
    expect(html).not.toContain('<option value="OLD">OLD</option>');
  });
});
