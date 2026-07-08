import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { PrismaClient } from "@prisma/client";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const SALES_FILE = path.join(DATA_DIR, "sales-records.json");
const PROFIT_KEY = "operational_gross_profit_percent";
const LEGACY_PROFIT_KEY = "slm_gross_profit_percent";

function parseArgs(argv = process.argv.slice(2)) {
  const filters = {};
  let json = false;
  for (const arg of argv) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) filters[match[1]] = match[2];
  }
  return { filters, json };
}

function jakartaParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function jakartaDateKey(value = new Date()) {
  const parts = jakartaParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function jakartaMonthKey(value = new Date()) {
  const parts = jakartaParts(value);
  return `${parts.year}-${parts.month}`;
}

export function formatDashboardMoney(value) {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  if (Math.abs(amount) >= 1_000_000) return `Rp ${Math.round(amount / 1_000).toLocaleString("id-ID")} jt`;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

function dateKey(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function monthKey(value) {
  return dateKey(value).slice(0, 7);
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function monthStart(value) {
  const key = monthKey(value);
  if (!/^\d{4}-\d{2}$/.test(key)) return null;
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function monthsBetween(start, end) {
  const months = [];
  for (let cursor = new Date(start.getFullYear(), start.getMonth(), 1); cursor <= end; cursor = addMonths(cursor, 1)) {
    months.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("id-ID", { month: "short" }).format(cursor),
      sales: 0,
      expenses: 0
    });
  }
  return months;
}

function approved(row) {
  return row.approvalStatus === "approved";
}

function isReceivedSale(row) {
  return row.paymentMethod === "Cash" || row.paymentMethod === "TF";
}

function typeCode(row) {
  return String(row.tipeCodeSnapshot || row.tipeId || "").trim().toUpperCase();
}

function isOperationalSale(row) {
  return typeCode(row) !== "AJ" && row.syncTarget !== "erp";
}

function isOperationalExpense(row) {
  return typeCode(row) !== "AJ";
}

function filterSales(sales, filters) {
  return sales.filter((sale) => {
    if (filters.from && sale.saleDate < filters.from) return false;
    if (filters.to && sale.saleDate > filters.to) return false;
    if (filters.paymentMethod && sale.paymentMethod !== filters.paymentMethod) return false;
    if (filters.rekening && (sale.rekeningId || sale.rekeningNameSnapshot || "") !== filters.rekening) return false;
    return true;
  });
}

function filterExpenses(expenses, filters) {
  return expenses.filter((expense) => {
    if (filters.from && expense.expenseDate < filters.from) return false;
    if (filters.to && expense.expenseDate > filters.to) return false;
    return true;
  });
}

function buildSalesMetrics(sales, todayKey, monthKeyValue) {
  const paidSales = sales.filter(approved);
  const salesThisMonth = paidSales.filter((sale) => sale.saleDate?.startsWith(monthKeyValue));
  const salesToday = paidSales.filter((sale) => sale.saleDate === todayKey);
  const receivedThisMonth = salesThisMonth.filter(isReceivedSale);
  return {
    totalThisMonth: salesThisMonth.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
    totalToday: salesToday.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
    totalReceivedThisMonth: receivedThisMonth.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
    salesThisMonthCount: salesThisMonth.length,
    salesTodayCount: salesToday.length,
    receivedThisMonthCount: receivedThisMonth.length
  };
}

function buildPaymentBreakdown(sales, rekeningLabels = {}) {
  const paidSales = sales.filter((sale) => approved(sale) && isReceivedSale(sale));
  const cashValue = paidSales.filter((sale) => sale.paymentMethod === "Cash").reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const transferTotals = new Map();
  for (const sale of paidSales) {
    if (sale.paymentMethod !== "TF") continue;
    const label = (sale.rekeningId && rekeningLabels[sale.rekeningId]) || sale.rekeningNameSnapshot || sale.transferAccount || "TF tanpa rekening";
    transferTotals.set(label, (transferTotals.get(label) || 0) + Number(sale.total || 0));
  }
  const transferRows = Array.from(transferTotals.entries()).map(([label, value]) => ({ label: `TF: ${label}`, value, formatted: formatDashboardMoney(value) })).sort((a, b) => b.value - a.value);
  return {
    cash: { label: "Cash", value: cashValue, formatted: formatDashboardMoney(cashValue) },
    transfers: transferRows,
    rows: [{ label: "Cash", value: cashValue, formatted: formatDashboardMoney(cashValue) }, ...transferRows].filter((row) => row.value > 0)
  };
}

function buildMonthlyPerformance(sales, expenses, now = new Date(), range = {}) {
  const end = range.to ? monthStart(range.to) : new Date(now.getFullYear(), now.getMonth(), 1);
  const start = range.from ? monthStart(range.from) : end ? addMonths(end, -5) : new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const months = start && end && start <= end ? monthsBetween(start, end) : monthsBetween(new Date(now.getFullYear(), now.getMonth() - 5, 1), new Date(now.getFullYear(), now.getMonth(), 1));
  const byMonth = new Map(months.map((month) => [month.key, month]));
  for (const sale of sales) {
    if (!approved(sale)) continue;
    const month = byMonth.get(monthKey(sale.saleDate));
    if (month) month.sales += Number(sale.total || 0);
  }
  for (const expense of expenses) {
    if (!approved(expense)) continue;
    const amount = Number(expense.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const month = byMonth.get(monthKey(expense.expenseDate));
    if (month) month.expenses += amount;
  }
  return months;
}

function buildOperationalProfitSummary(sales, expenses, todayKey, monthKeyValue, grossProfitPercent = 0) {
  const percent = Number.isFinite(Number(grossProfitPercent)) ? Math.min(100, Math.max(0, Number(grossProfitPercent))) : 0;
  const approvedOperationalSales = sales.filter((sale) => approved(sale) && isOperationalSale(sale));
  const approvedOperationalExpenses = expenses.filter((expense) => approved(expense) && isOperationalExpense(expense));
  const monthlySales = approvedOperationalSales.filter((sale) => sale.saleDate?.startsWith(monthKeyValue));
  const todaySales = approvedOperationalSales.filter((sale) => sale.saleDate === todayKey);
  const monthlyExpenses = approvedOperationalExpenses.filter((expense) => expense.expenseDate?.startsWith(monthKeyValue));
  const todayExpenses = approvedOperationalExpenses.filter((expense) => expense.expenseDate === todayKey);
  const monthlyRevenue = monthlySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const monthlyExpenseTotal = monthlyExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const grossProfit = monthlyRevenue * percent / 100;
  return {
    grossProfitPercent: percent,
    monthlyRevenue,
    monthlyExpenses: monthlyExpenseTotal,
    todayRevenue: todaySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
    todayExpenses: todayExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
    grossProfit,
    nettProfit: grossProfit - monthlyExpenseTotal,
    monthlySalesCount: monthlySales.length,
    todaySalesCount: todaySales.length
  };
}

function readJsonSales() {
  if (!existsSync(SALES_FILE)) return [];
  return JSON.parse(readFileSync(SALES_FILE, "utf8"));
}

function mergeSales(primary, secondary) {
  const byId = new Map();
  for (const sale of [...secondary, ...primary]) byId.set(sale.id, sale);
  return Array.from(byId.values());
}

function toSale(row) {
  return {
    id: row.id,
    saleDate: dateKey(row.saleDate),
    tipeId: row.tipeId,
    tipeCodeSnapshot: row.tipeCodeSnapshot,
    tipeNameSnapshot: row.tipeNameSnapshot,
    rekeningId: row.rekeningId || undefined,
    rekeningNameSnapshot: row.rekeningNameSnapshot || undefined,
    transferAccount: row.transferAccount || undefined,
    customerName: row.customerName,
    paymentMethod: row.paymentMethod,
    total: Number(row.total),
    approvalStatus: row.approvalStatus,
    syncTarget: row.syncTarget || undefined,
    syncStatus: row.syncStatus || undefined,
    createdAt: row.createdAt?.toISOString?.() || row.createdAt,
    items: []
  };
}

function toExpense(row) {
  return {
    id: row.id,
    expenseDate: dateKey(row.expenseDate),
    tipeId: row.tipeId,
    tipeCodeSnapshot: row.tipeCodeSnapshot,
    tipeNameSnapshot: row.tipeNameSnapshot,
    rekeningId: row.rekeningId,
    rekeningNameSnapshot: row.rekeningNameSnapshot,
    amount: Number(row.amount),
    approvalStatus: row.approvalStatus,
    createdAt: row.createdAt?.toISOString?.() || row.createdAt
  };
}

async function readDataFromPrisma(prisma, appMode) {
  const [salesRows, expenseRows, setting, rekeningRows] = await Promise.all([
    prisma.salesRecord.findMany(),
    prisma.expenseRecord.findMany(),
    prisma.appSetting.findFirst({ where: { key: { in: [PROFIT_KEY, LEGACY_PROFIT_KEY] } }, orderBy: { key: "asc" } }),
    prisma.rekeningAccount.findMany()
  ]);
  const prismaSales = salesRows.map(toSale);
  return {
    sales: appMode === "production" ? prismaSales : mergeSales(readJsonSales(), prismaSales),
    expenses: expenseRows.map(toExpense),
    grossProfitPercent: Number(setting?.value ?? 0) || 0,
    rekeningLabels: Object.fromEntries(rekeningRows.map((rekening) => [rekening.id, rekening.bankName && rekening.bankName !== rekening.name ? `${rekening.name} - ${rekening.bankName}` : rekening.name]))
  };
}

function auditErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Can't reach database server")) return "Database tidak bisa diakses. Pastikan DATABASE_URL benar, database aktif, dan migration sudah applied.";
  if (message.includes("AppSetting") && (message.includes("does not exist") || message.includes("doesn't exist"))) return "Database belum dimigrasi. Jalankan npx prisma migrate deploy lalu restart aplikasi.";
  return message.replace(/\s+/g, " ").trim();
}

export function buildDashboardAuditReport(input) {
  const filters = input.filters || {};
  const todayKey = input.todayKey || jakartaDateKey();
  const monthKeyValue = input.monthKey || jakartaMonthKey();
  const filteredSales = filterSales(input.sales || [], filters);
  const filteredExpenses = filterExpenses(input.expenses || [], filters);
  const salesMetrics = buildSalesMetrics(filteredSales, todayKey, monthKeyValue);
  const operationalProfit = buildOperationalProfitSummary(input.sales || [], input.expenses || [], todayKey, monthKeyValue, input.grossProfitPercent || 0);
  const paymentBreakdown = buildPaymentBreakdown(filteredSales, input.rekeningLabels || {});
  const performance = buildMonthlyPerformance(filteredSales, filteredExpenses, new Date(), filters);
  return {
    status: "PASS",
    generatedAt: new Date().toISOString(),
    filters,
    period: { today: todayKey, month: monthKeyValue },
    sourceCounts: { sales: (input.sales || []).length, expenses: (input.expenses || []).length },
    kpis: {
      omzetMonth: { value: salesMetrics.totalThisMonth, formatted: formatDashboardMoney(salesMetrics.totalThisMonth), count: salesMetrics.salesThisMonthCount },
      omzetToday: { value: salesMetrics.totalToday, formatted: formatDashboardMoney(salesMetrics.totalToday), count: salesMetrics.salesTodayCount },
      receivedMonth: { value: salesMetrics.totalReceivedThisMonth, formatted: formatDashboardMoney(salesMetrics.totalReceivedThisMonth), count: salesMetrics.receivedThisMonthCount }
    },
    paymentBreakdown,
    performance,
    operationalProfit: {
      ...operationalProfit,
      formatted: {
        monthlyRevenue: formatDashboardMoney(operationalProfit.monthlyRevenue),
        monthlyExpenses: formatDashboardMoney(operationalProfit.monthlyExpenses),
        todayRevenue: formatDashboardMoney(operationalProfit.todayRevenue),
        todayExpenses: formatDashboardMoney(operationalProfit.todayExpenses),
        grossProfit: formatDashboardMoney(operationalProfit.grossProfit),
        nettProfit: formatDashboardMoney(operationalProfit.nettProfit)
      },
      formulas: {
        grossProfit: `omset operasional bulan ini x ${operationalProfit.grossProfitPercent}% / 100`,
        nettProfit: "grossProfit - pengeluaran operasional bulan ini"
      }
    }
  };
}

function printTextReport(report) {
  console.log("Dashboard Audit: PASS");
  console.log(`Periode: today=${report.period.today}, month=${report.period.month}`);
  console.log(`Omzet bulan ini: ${report.kpis.omzetMonth.formatted} (${report.kpis.omzetMonth.count} transaksi)`);
  console.log(`Omzet hari ini: ${report.kpis.omzetToday.formatted} (${report.kpis.omzetToday.count} transaksi)`);
  console.log(`Kas/TF bulan ini: ${report.kpis.receivedMonth.formatted} (${report.kpis.receivedMonth.count} transaksi)`);
  console.log(`Gross Profit Operasional ${report.operationalProfit.grossProfitPercent}%: ${report.operationalProfit.formatted.grossProfit}`);
  console.log(`Nett Profit Operasional: ${report.operationalProfit.formatted.nettProfit}`);
  console.log(`Rumus Gross: ${report.operationalProfit.formulas.grossProfit}`);
  console.log(`Rumus Nett: ${report.operationalProfit.formulas.nettProfit}`);
}

async function main() {
  const { filters, json } = parseArgs();
  const prisma = new PrismaClient();
  try {
    const appMode = process.env.NEXT_PUBLIC_APP_MODE || "development";
    const data = await readDataFromPrisma(prisma, appMode);
    const report = buildDashboardAuditReport({ ...data, filters });
    if (json) console.log(JSON.stringify(report, null, 2));
    else printTextReport(report);
  } catch (error) {
    console.error(`Dashboard Audit: FAIL - ${auditErrorMessage(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
