import { prisma } from "../lib/db/prisma";
import { getFinancialAiForecast } from "../lib/ai/financialAiService";
import { getOperationalProfitSetting } from "../lib/settings/profit";

async function main() {
  console.log("=== CHECKING FINANCIAL AI VALUES ===");

  const profitSetting = await getOperationalProfitSetting();
  console.log("Profit setting fallback %:", profitSetting.grossProfitPercent);

  const forecast = await getFinancialAiForecast({ forceRefresh: true });
  console.log("\n--- FORECAST BASE METRICS ---");
  console.log(JSON.stringify(forecast.baseMetrics, null, 2));

  console.log("\n--- FORECAST PROJECTIONS ---");
  console.log(JSON.stringify(forecast.projections, null, 2));

  console.log("\n--- CRITICAL ALERTS COUNT ---", forecast.criticalAlerts.length);
  if (forecast.criticalAlerts.length > 0) {
    console.log(JSON.stringify(forecast.criticalAlerts[0], null, 2));
  }

  console.log("\n--- PRIORITY COLLECTIONS COUNT ---", forecast.priorityCollections.length);
  if (forecast.priorityCollections.length > 0) {
    console.log(JSON.stringify(forecast.priorityCollections[0], null, 2));
  }

  // Check actual DB records
  const totalSalesCount = await prisma.salesRecord.count();
  const totalExpensesCount = await prisma.expenseRecord.count();
  const totalReceivablesCount = await prisma.tempoReceivable.count();
  const totalTempoPaymentsCount = await prisma.tempoPayment.count();

  console.log("\n--- TOTAL DB COUNTS ---");
  console.log({ totalSalesCount, totalExpensesCount, totalReceivablesCount, totalTempoPaymentsCount });

  // Check past 30 days sales
  const today = new Date();
  const past30DaysDate = new Date();
  past30DaysDate.setDate(today.getDate() - 30);

  const sales30 = await prisma.salesRecord.findMany({
    where: { saleDate: { gte: past30DaysDate }, approvalStatus: { notIn: ["rejected", "cancelled"] } },
    select: { id: true, total: true, paymentMethod: true, initialPaymentAmount: true, saleDate: true }
  });

  const methodBreakdown: Record<string, { count: number; total: number }> = {};
  let totalSalesAmount = 0;
  for (const s of sales30) {
    const t = Number(s.total) || 0;
    totalSalesAmount += t;
    const m = s.paymentMethod || "UNKNOWN";
    if (!methodBreakdown[m]) methodBreakdown[m] = { count: 0, total: 0 };
    methodBreakdown[m].count++;
    methodBreakdown[m].total += t;
  }

  console.log("\n--- PAST 30 DAYS SALES ---");
  console.log("Total Count:", sales30.length, "Total Amount:", totalSalesAmount);
  console.log("Method breakdown:", methodBreakdown);

  // Check expenses 30
  const expenses30 = await prisma.expenseRecord.findMany({
    where: { expenseDate: { gte: past30DaysDate }, approvalStatus: "approved" },
    select: { id: true, amount: true, category: true, expenseDate: true }
  });
  const totalExp = expenses30.reduce((acc, e) => acc + Number(e.amount), 0);
  console.log("\n--- PAST 30 DAYS APPROVED EXPENSES ---");
  console.log("Count:", expenses30.length, "Total Amount:", totalExp);

  // Check all-time net operational cash (all cash/TF sales + all tempo payments - all approved expenses)
  const allCashSales = await prisma.salesRecord.aggregate({
    where: { approvalStatus: { notIn: ["rejected", "cancelled"] }, paymentMethod: { in: ["Cash", "TF"] } },
    _sum: { total: true }
  });
  const allDpSales = await prisma.salesRecord.aggregate({
    where: { approvalStatus: { notIn: ["rejected", "cancelled"] }, paymentMethod: { notIn: ["Cash", "TF"] } },
    _sum: { initialPaymentAmount: true }
  });
  const allTempoPayments = await prisma.tempoPayment.aggregate({
    _sum: { amountPaid: true }
  });
  const allExpenses = await prisma.expenseRecord.aggregate({
    where: { approvalStatus: "approved" },
    _sum: { amount: true }
  });

  const cumulativeCashIn = (Number(allCashSales._sum.total) || 0) + (Number(allDpSales._sum.initialPaymentAmount) || 0) + (Number(allTempoPayments._sum.amountPaid) || 0);
  const cumulativeCashOut = Number(allExpenses._sum.amount) || 0;
  const cumulativeNetCash = cumulativeCashIn - cumulativeCashOut;

  console.log("\n--- CUMULATIVE OPERATIONAL CASH (ALL TIME) ---");
  console.log({ cumulativeCashIn, cumulativeCashOut, cumulativeNetCash });
}

main().catch(console.error).finally(() => process.exit(0));
