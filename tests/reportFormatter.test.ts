import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getPaidSalesReport: vi.fn(),
  listTempoReceivables: vi.fn()
}));

vi.mock("@/lib/appBrand", () => ({ APP_BRAND_NAME: "SLM" }));
vi.mock("@/lib/reports/store", () => ({ getPaidSalesReport: mocks.getPaidSalesReport }));
vi.mock("@/lib/tempo/store", () => ({ listTempoReceivables: mocks.listTempoReceivables }));

import { formatDailyReport } from "@/lib/whatsapp/reportFormatter";
import { buildPaidSalesReport } from "@/lib/reports/summary";
import type { Sale } from "@/lib/types/sales";
import type { TempoReceivable } from "@/lib/tempo/store";

const sale = (input: Partial<Sale>): Sale => ({
  id: "S-1",
  saleDate: "2026-06-29",
  customerName: "Budi",
  paymentMethod: "Cash",
  total: 100_000,
  approvalStatus: "approved",
  tipeCodeSnapshot: "AJ",
  items: [],
  ...input
});

const tempo: TempoReceivable = {
  id: "TMP-1",
  salesId: "S-3",
  tipeId: "AJ",
  tipeCodeSnapshot: "AJ",
  tipeNameSnapshot: "AJ",
  customerName: "Tempo Customer",
  originalAmount: 300_000,
  paidAmount: 0,
  remainingAmount: 300_000,
  transactionDate: "2026-06-29",
  dueDate: "2026-07-29",
  status: "open",
  createdByUserId: "u-1",
  createdByNameSnapshot: "User",
  createdAt: "2026-06-29T00:00:00.000Z",
  updatedAt: "2026-06-29T00:00:00.000Z"
};

describe("daily report formatter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listTempoReceivables.mockResolvedValue([tempo]);
  });

  it("uses Jakarta date and excludes Tempo, pending, and rejected sales from grand total", async () => {
    mocks.getPaidSalesReport.mockResolvedValue(buildPaidSalesReport([
      sale({ id: "S-CASH", total: 100_000, paymentMethod: "Cash" }),
      sale({ id: "S-TF", total: 200_000, paymentMethod: "TF" }),
      sale({ id: "S-TEMPO", total: 300_000, paymentMethod: "Tempo" }),
      sale({ id: "S-QA", total: 999_000, paymentMethod: "Cash", isTestTransaction: true }),
      sale({ id: "S-ERP-FAILED", total: 50_000, paymentMethod: "Cash", syncTarget: "erp", syncStatus: "failed" }),
      sale({ id: "S-PENDING", total: 400_000, paymentMethod: "Cash", approvalStatus: "pending_approval" }),
      sale({ id: "S-REJECTED", total: 500_000, paymentMethod: "TF", approvalStatus: "rejected" })
    ], "2026-06-29"));

    const report = await formatDailyReport(new Date("2026-06-28T18:00:00.000Z"));

    expect(report).toContain("Laporan Harian SLM - 29/06/2026");
    expect(report).toMatch(/Grand Total: Rp\s?350\.000/);
    expect(report).toMatch(/Cash: Rp\s?150\.000/);
    expect(report).toMatch(/TF: Rp\s?200\.000/);
    expect(report).toContain("AJ belum tersinkron ERP:");
    expect(report).toMatch(/1 transaksi - Rp\s?50\.000/);
    expect(report).toContain("Tempo Customer");
    expect(report).not.toMatch(/Rp\s?1\.500\.000/);
    expect(report).not.toMatch(/Rp\s?999\.000/);
  });
});
