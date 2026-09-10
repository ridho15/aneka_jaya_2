import { createRequire } from "node:module";
const require = createRequire("/Users/lrmcorporation/Documents/Website/SLM/package.json");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("=== INSPECTING ACTUAL DATABASE FINANCIAL VALUES ===");

  // 1. App Setting
  const setting = await prisma.appSetting.findFirst({
    where: { key: { in: ["operational_gross_profit_percent", "slm_gross_profit_percent"] } },
    orderBy: { key: "asc" }
  });
  console.log("Operational Gross Profit Setting:", setting?.value);

  // 2. Dates
  const today = new Date();
  const past30DaysDate = new Date();
  past30DaysDate.setDate(today.getDate() - 30);

  console.log("Date range (past 30 days):", past30DaysDate.toISOString(), "to", today.toISOString());

  // 3. Sales in past 30 days
  const sales = await prisma.salesRecord.findMany({
    where: {
      saleDate: { gte: past30DaysDate },
      approvalStatus: { notIn: ["rejected", "cancelled"] }
    },
    include: { items: true }
  });

  let past30CashInflow = 0;
  let past30TotalRevenue = 0;
  let past30GrossProfit = 0;

  for (const s of sales) {
    const total = Number(s.total) || 0;
    past30TotalRevenue += total;

    if (s.paymentMethod === "Cash" || s.paymentMethod === "TF") {
      past30CashInflow += total;
    } else if (Number(s.initialPaymentAmount) > 0) {
      past30CashInflow += Number(s.initialPaymentAmount);
    }

    let itemCostTotal = 0;
    let hasCost = false;
    for (const item of s.items) {
      const manualCost = Number(item.manualProduct?.costPrice);
      const qty = Number(item.quantity) || 0;
      if (Number.isFinite(manualCost) && manualCost > 0) {
        itemCostTotal += manualCost * qty;
        hasCost = true;
      }
    }

    if (hasCost && itemCostTotal > 0) {
      past30GrossProfit += Math.max(0, total - itemCostTotal);
    } else {
      past30GrossProfit += Math.round(total * 0.10); // using 10%
    }
  }

  // 4. Tempo payments in past 30 days
  const tempoPayments = await prisma.tempoPayment.findMany({
    where: { paymentDate: { gte: past30DaysDate } }
  });
  let past30TempoPayments = 0;
  for (const p of tempoPayments) {
    past30TempoPayments += Number(p.amountPaid) || 0;
  }
  past30CashInflow += past30TempoPayments;

  // 5. Approved expenses in past 30 days
  const expenses = await prisma.expenseRecord.findMany({
    where: {
      expenseDate: { gte: past30DaysDate },
      approvalStatus: "approved"
    }
  });
  let past30TotalExpenses = 0;
  const expenseByCategory = {};
  for (const e of expenses) {
    const amt = Number(e.amount) || 0;
    past30TotalExpenses += amt;
    const cat = e.category || e.coaNameSnapshot || "Lain-lain";
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + amt;
  }

  // 6. Active Receivables
  const activeReceivables = await prisma.tempoReceivable.findMany({
    where: { status: { in: ["open", "partial_paid", "overdue"] } },
    orderBy: { dueDate: "asc" }
  });
  let totalActiveReceivables = 0;
  let overdueReceivables = 0;
  let upcomingReceivables = 0;

  for (const r of activeReceivables) {
    const rem = Number(r.remainingAmount) || 0;
    totalActiveReceivables += rem;
    const dueDate = new Date(r.dueDate);
    if (dueDate < today) {
      overdueReceivables += rem;
    } else {
      upcomingReceivables += rem;
    }
  }

  // 7. Liquidity and Net
  const past30NettProfit = past30GrossProfit - past30TotalExpenses;
  const dailyBurnRate = Math.max(1, Math.round(past30TotalExpenses / 30));
  const minimumBufferThreshold = Math.max(10_000_000, dailyBurnRate * 7);

  console.log("\n--- DETAILED SUMMARY METRICS ---");
  console.log({
    salesCount: sales.length,
    past30TotalRevenue,
    past30CashInflow,
    past30TempoPayments,
    past30GrossProfit,
    grossMarginPercent: past30TotalRevenue > 0 ? (past30GrossProfit / past30TotalRevenue) * 100 : 0,
    expensesCount: expenses.length,
    past30TotalExpenses,
    past30NettProfit,
    dailyBurnRate,
    minimumBufferThreshold,
    activeReceivablesCount: activeReceivables.length,
    totalActiveReceivables,
    overdueReceivables,
    upcomingReceivables
  });

  console.log("\n--- TOP EXPENSE CATEGORIES ---");
  console.log(expenseByCategory);

  console.log("\n--- TOP 5 RECEIVABLES ---");
  console.log(activeReceivables.slice(0, 5).map(r => ({
    customer: r.customerName,
    dueDate: r.dueDate,
    remaining: Number(r.remainingAmount),
    status: r.status
  })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
