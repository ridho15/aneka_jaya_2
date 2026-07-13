import { describe, expect, it } from "vitest";
import { auditSalesSyncSafety, buildDashboardAuditReport } from "@/scripts/audit-dashboard-values.mjs";

describe("dashboard audit report", () => {
  it("fails sync safety for ERP targets outside configured sales types and dummy records that are not local", () => {
    const safety = auditSalesSyncSafety([
      { id: "LOCAL-W", tipeCodeSnapshot: "W", syncTarget: "local" },
      { id: "ERP-AJ", tipeCodeSnapshot: "AJ", syncTarget: "erp" },
      { id: "BAD-SLM", tipeCodeSnapshot: "SLM", syncTarget: "erp" },
      { id: "DUMMY-DASH-BAD", tipeCodeSnapshot: "W" }
    ], { salesErpTypeCodes: "AJ" });

    expect(safety.status).toBe("FAIL");
    expect(safety.unexpectedErp.map((item) => item.id)).toEqual(["BAD-SLM"]);
    expect(safety.dummyNonLocal.map((item) => item.id)).toEqual(["DUMMY-DASH-BAD"]);
    expect(safety.violations).toHaveLength(2);
  });

  it("passes sync safety for local dummy records and configured ERP sales types", () => {
    expect(auditSalesSyncSafety([
      { id: "DUMMY-DASH-OK", tipeCodeSnapshot: "SLM", syncTarget: "local" },
      { id: "ONLINE-OK", tipeCodeSnapshot: "ONLINE", syncTarget: "erp" },
      { id: "AJ-ERP", tipeCodeSnapshot: "AJ", syncTarget: "erp" }
    ], { salesErpTypeCodes: "AJ,W,SLM,ONLINE" })).toMatchObject({ status: "PASS", violations: [] });
  });

  it("recomputes operational gross and nett profit with custom percentage", () => {
    const report = buildDashboardAuditReport({
      todayKey: "2026-07-08",
      monthKey: "2026-07",
      grossProfitPercent: 10,
      salesErpTypeCodes: "AJ,W,SLM,ONLINE",
      rekeningLabels: { bca: "BCA Operasional - BCA" },
      sales: [
        { id: "w-month", saleDate: "2026-07-02", tipeId: "W", tipeCodeSnapshot: "W", paymentMethod: "Cash", total: 1_000_000, approvalStatus: "approved" },
        { id: "slm-month", saleDate: "2026-07-02", tipeId: "SLM", tipeCodeSnapshot: "SLM", paymentMethod: "Cash", total: 1_000_000, approvalStatus: "approved" },
        { id: "slm-today", saleDate: "2026-07-08", tipeId: "SLM", tipeCodeSnapshot: "SLM", paymentMethod: "TF", rekeningId: "bca", total: 500_000, approvalStatus: "approved" },
        { id: "online-today", saleDate: "2026-07-08", tipeId: "ONLINE", tipeCodeSnapshot: "ONLINE", paymentMethod: "Cash", total: 250_000, approvalStatus: "approved" },
        { id: "aj", saleDate: "2026-07-08", tipeId: "AJ", tipeCodeSnapshot: "AJ", paymentMethod: "Cash", total: 9_000_000, approvalStatus: "approved" },
        { id: "erp", saleDate: "2026-07-08", tipeId: "SLM", tipeCodeSnapshot: "SLM", paymentMethod: "Cash", total: 8_000_000, approvalStatus: "approved", syncTarget: "erp" },
        { id: "pending-slm", saleDate: "2026-07-08", tipeId: "SLM", tipeCodeSnapshot: "SLM", paymentMethod: "Cash", total: 700_000, approvalStatus: "pending_approval" },
        { id: "backdated", saleDate: "2026-06-30", createdAt: "2026-07-08T08:00:00.000Z", tipeId: "SLM", tipeCodeSnapshot: "SLM", paymentMethod: "Cash", total: 300_000, approvalStatus: "approved" }
      ],
      expenses: [
        { id: "w-expense", expenseDate: "2026-07-03", tipeId: "W", tipeCodeSnapshot: "W", amount: 100_000, approvalStatus: "approved" },
        { id: "slm-expense", expenseDate: "2026-07-03", tipeId: "SLM", tipeCodeSnapshot: "SLM", amount: 100_000, approvalStatus: "approved" },
        { id: "slm-today-expense", expenseDate: "2026-07-08", tipeId: "SLM", tipeCodeSnapshot: "SLM", amount: 25_000, approvalStatus: "approved" },
        { id: "aj-expense", expenseDate: "2026-07-08", tipeId: "AJ", tipeCodeSnapshot: "AJ", amount: 900_000, approvalStatus: "approved" },
        { id: "rejected-slm", expenseDate: "2026-07-08", tipeId: "SLM", tipeCodeSnapshot: "SLM", amount: 99_000, approvalStatus: "rejected" }
      ]
    });

    expect(report.operationalProfit.monthlyRevenue).toBe(10_750_000);
    expect(report.operationalProfit.todayRevenue).toBe(8_750_000);
    expect(report.operationalProfit.monthlyExpenses).toBe(225_000);
    expect(report.operationalProfit.todayExpenses).toBe(25_000);
    expect(report.operationalProfit.grossProfit).toBe(1_075_000);
    expect(report.operationalProfit.nettProfit).toBe(850_000);
    expect(report.operationalProfit.formulas.grossProfit).toBe("omset operasional bulan ini x 10% / 100");
    expect(report.status).toBe("PASS");
    expect(report.syncSafety.unexpectedErp).toEqual([]);
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
