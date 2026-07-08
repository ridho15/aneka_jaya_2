import { describe, expect, it } from "vitest";
import { buildDashboardAuditReport } from "@/scripts/audit-dashboard-values.mjs";

describe("dashboard audit report", () => {
  it("recomputes SLM gross and nett profit with custom percentage", () => {
    const report = buildDashboardAuditReport({
      todayKey: "2026-07-08",
      monthKey: "2026-07",
      grossProfitPercent: 10,
      rekeningLabels: { bca: "BCA Operasional - BCA" },
      sales: [
        { id: "slm-month", saleDate: "2026-07-02", tipeId: "SLM", tipeCodeSnapshot: "SLM", paymentMethod: "Cash", total: 1_000_000, approvalStatus: "approved" },
        { id: "slm-today", saleDate: "2026-07-08", tipeId: "SLM", tipeCodeSnapshot: "SLM", paymentMethod: "TF", rekeningId: "bca", total: 500_000, approvalStatus: "approved" },
        { id: "aj", saleDate: "2026-07-08", tipeId: "AJ", tipeCodeSnapshot: "AJ", paymentMethod: "Cash", total: 9_000_000, approvalStatus: "approved" },
        { id: "pending-slm", saleDate: "2026-07-08", tipeId: "SLM", tipeCodeSnapshot: "SLM", paymentMethod: "Cash", total: 700_000, approvalStatus: "pending_approval" },
        { id: "backdated", saleDate: "2026-06-30", createdAt: "2026-07-08T08:00:00.000Z", tipeId: "SLM", tipeCodeSnapshot: "SLM", paymentMethod: "Cash", total: 300_000, approvalStatus: "approved" }
      ],
      expenses: [
        { id: "slm-expense", expenseDate: "2026-07-03", tipeId: "SLM", tipeCodeSnapshot: "SLM", amount: 100_000, approvalStatus: "approved" },
        { id: "slm-today-expense", expenseDate: "2026-07-08", tipeId: "SLM", tipeCodeSnapshot: "SLM", amount: 25_000, approvalStatus: "approved" },
        { id: "rejected-slm", expenseDate: "2026-07-08", tipeId: "SLM", tipeCodeSnapshot: "SLM", amount: 99_000, approvalStatus: "rejected" }
      ]
    });

    expect(report.slmProfit.monthlyRevenue).toBe(1_500_000);
    expect(report.slmProfit.todayRevenue).toBe(500_000);
    expect(report.slmProfit.monthlyExpenses).toBe(125_000);
    expect(report.slmProfit.todayExpenses).toBe(25_000);
    expect(report.slmProfit.grossProfit).toBe(150_000);
    expect(report.slmProfit.nettProfit).toBe(25_000);
    expect(report.slmProfit.formulas.grossProfit).toBe("omset SLM bulan ini x 10% / 100");
  });

  it("builds dashboard KPI and payment expected values with compact money formatting", () => {
    const report = buildDashboardAuditReport({
      todayKey: "2026-07-08",
      monthKey: "2026-07",
      grossProfitPercent: 0,
      rekeningLabels: { bca: "BCA Operasional - BCA" },
      sales: [
        { id: "cash", saleDate: "2026-07-08", tipeId: "W", tipeCodeSnapshot: "W", paymentMethod: "Cash", total: 39_000_000, approvalStatus: "approved" },
        { id: "tf", saleDate: "2026-07-02", tipeId: "W", tipeCodeSnapshot: "W", paymentMethod: "TF", rekeningId: "bca", total: 950_000, approvalStatus: "approved" },
        { id: "tempo", saleDate: "2026-07-02", tipeId: "W", tipeCodeSnapshot: "W", paymentMethod: "Tempo", total: 2_000_000, approvalStatus: "approved" }
      ],
      expenses: []
    });

    expect(report.kpis.omzetMonth.value).toBe(41_950_000);
    expect(report.kpis.omzetToday.value).toBe(39_000_000);
    expect(report.kpis.receivedMonth.value).toBe(39_950_000);
    expect(report.kpis.omzetToday.formatted).toBe("Rp 39.000 jt");
    expect(report.paymentBreakdown.rows).toEqual([
      { label: "Cash", value: 39_000_000, formatted: "Rp 39.000 jt" },
      { label: "TF: BCA Operasional - BCA", value: 950_000, formatted: "Rp 950.000" }
    ]);
  });
});
