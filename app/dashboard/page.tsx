import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ResponsiveFilterPanel } from "@/components/ui/ResponsiveFilterPanel";
import { Select } from "@/components/ui/Select";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { PaymentBreakdownChart, type PaymentPeriod } from "@/components/dashboard/PaymentBreakdownChart";
import { listProducts } from "@/lib/api/products";
import { getOpenCloudStatus } from "@/lib/opencloud/auth";
import { can } from "@/lib/auth/roles";
import { getCurrentRole, getCurrentUser } from "@/lib/auth/session";
import { listSalesRecords } from "@/lib/sales/store";
import { listExpenseRecords } from "@/lib/expenses/store";
import { listAudit } from "@/lib/audit/store";
import { activityStatusText, activityText, buildMonthlyPerformance, buildOperationalProfitSummary, buildPaymentBreakdown, dashboardDataSourceNotice, filterDashboardSales, formatDashboardMoney, type DashboardSalesFilters } from "@/lib/dashboard/summary";
import { jakartaDateKey, jakartaMonthKey } from "@/lib/date/jakarta";
import { getWhatsappProviderStatus } from "@/lib/whatsapp/whatsappClient";
import type { Sale } from "@/lib/types/sales";
import { listRekeningAccounts, type RekeningAccount } from "@/lib/business/masterData";
import { getOperationalProfitSetting } from "@/lib/settings/profit";
import { listTempoPaymentReversals, listTempoPayments } from "@/lib/tempo/store";
import { getStockInventoryReport } from "@/lib/reports/stockReports";
import { SupervisorStockDashboard } from "@/components/dashboard/SupervisorStockDashboard";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const paymentMethods: Sale["paymentMethod"][] = ["Cash", "TF", "Tempo", "Other"];

function valueOf(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function dashboardFilters(params: SearchParams): DashboardSalesFilters {
  return {
    from: valueOf(params, "from") || undefined,
    to: valueOf(params, "to") || undefined,
    paymentMethod: valueOf(params, "paymentMethod") || undefined,
    rekening: valueOf(params, "rekening") || undefined
  };
}

const dayPattern = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
function validDayKey(value?: string) {
  if (!value || !dayPattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function monthEnd(month: string) {
  const [year, value] = month.split("-").map(Number);
  return `${year}-${String(value).padStart(2, "0")}-${new Date(Date.UTC(year, value, 0)).getUTCDate().toString().padStart(2, "0")}`;
}
function paymentPeriodFromParams(params: SearchParams, currentMonth: string): PaymentPeriod {
  const requestedMode = valueOf(params, "paymentPeriod");
  const mode: PaymentPeriod["mode"] = requestedMode === "day" ? "day" : "day-range";
  const defaultFrom = `${currentMonth}-01`;
  const defaultTo = monthEnd(currentMonth);
  const day = validDayKey(valueOf(params, "paymentDate")) ? valueOf(params, "paymentDate") as string : defaultFrom;
  const dayFrom = validDayKey(valueOf(params, "paymentFrom")) ? valueOf(params, "paymentFrom") as string : defaultFrom;
  const dayTo = validDayKey(valueOf(params, "paymentTo")) ? valueOf(params, "paymentTo") as string : defaultTo;
  const from = mode === "day" ? day : dayFrom;
  const to = mode === "day" ? day : dayTo;
  const error = from > to ? "Periode awal tidak boleh melewati periode akhir." : undefined;
  const label = error ? "Periode tidak valid" : mode === "day" ? `Tanggal ${day}` : `${from} sampai ${to}`;
  return { mode, day, from, to, label, transactionCount: 0, error };
}

function preservedDashboardParams(params: SearchParams) {
  const paymentKeys = new Set(["paymentPeriod", "paymentDate", "paymentFrom", "paymentTo"]);
  return Object.fromEntries(Object.entries(params).flatMap(([key, raw]) => {
    const value = Array.isArray(raw) ? raw[0] : raw;
    return !value || paymentKeys.has(key) ? [] : [[key, value]];
  }));
}

function rekeningLabel(rekening: Pick<RekeningAccount, "bank" | "name">) {
  return rekening.bank && rekening.bank !== rekening.name ? `${rekening.name} - ${rekening.bank}` : rekening.name;
}

function rekeningLabelMap(rekenings: RekeningAccount[]) {
  return Object.fromEntries(rekenings.map((rekening) => [rekening.id, rekeningLabel(rekening)]));
}

function rekeningOptions(sales: Sale[], rekenings: RekeningAccount[]) {
  const options = new Map<string, string>();
  for (const rekening of rekenings) options.set(rekening.id, rekeningLabel(rekening));
  for (const sale of sales) {
    if (sale.paymentMethod !== "Cash" && sale.paymentMethod !== "TF") continue;
    const value = sale.rekeningId || sale.rekeningNameSnapshot;
    const label = sale.rekeningNameSnapshot || sale.transferAccount || sale.rekeningId;
    if (value && label) options.set(value, label);
  }
  return Array.from(options.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

function activeFilterLabels(params: SearchParams) {
  return [
    valueOf(params, "from") ? `Dari ${valueOf(params, "from")}` : null,
    valueOf(params, "to") ? `Sampai ${valueOf(params, "to")}` : null,
    valueOf(params, "paymentMethod") ? `Pembayaran: ${valueOf(params, "paymentMethod")}` : null,
    valueOf(params, "rekening") ? `Rekening: ${valueOf(params, "rekening")}` : null
  ].filter(Boolean) as string[];
}

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const role = await getCurrentRole();
  if (!can(role, "dashboard.view")) redirect("/no-access");
  const user = await getCurrentUser();

  if (role === "SUPERVISOR") {
    const stockReport = await getStockInventoryReport();
    return (
      <AppShell>
        <SupervisorStockDashboard
          userName={user.name}
          stockItems={stockReport.items}
          warehouses={stockReport.warehouses}
        />
      </AppShell>
    );
  }

  const params = await searchParams || {};
  const filters = dashboardFilters(params);
  const products = await listProducts();
  const cloud = getOpenCloudStatus();
  const audit = await listAudit({ role });
  const activities = audit.slice(0, 5);

  const todayStr = jakartaDateKey();
  const monthStr = jakartaMonthKey();
  const paymentPeriod = paymentPeriodFromParams(params, monthStr);
  const allSales = await listSalesRecords();
  const [allExpenses, allRekenings, allTempoPayments, allTempoReversals] = await Promise.all([
    listExpenseRecords(),
    listRekeningAccounts(),
    listTempoPayments(),
    listTempoPaymentReversals()
  ]);
  const canViewOperationalProfit = can(role, "settings.profit.manage");
  const rekeningLabels = rekeningLabelMap(allRekenings);
  const filteredSales = filterDashboardSales(allSales, filters);
  const filteredExpenses = allExpenses.filter((expense) => {
    if (filters.from && expense.expenseDate < filters.from) return false;
    if (filters.to && expense.expenseDate > filters.to) return false;
    return true;
  });
  const profitSetting = canViewOperationalProfit ? await getOperationalProfitSetting() : null;
  const operationalProfit = canViewOperationalProfit && profitSetting
    ? buildOperationalProfitSummary(allSales, allExpenses, todayStr, monthStr, profitSetting.grossProfitPercent, products.success ? products.data : [])
    : null;
  const performance = buildMonthlyPerformance(
    filteredSales,
    filteredExpenses,
    new Date(),
    { from: filters.from, to: filters.to },
    profitSetting?.grossProfitPercent ?? 0,
    products.success ? products.data : []
  );
  const paymentSales = paymentPeriod.error ? [] : filterDashboardSales(allSales, { from: paymentPeriod.from, to: paymentPeriod.to });
  const paymentTempo = paymentPeriod.error ? [] : allTempoPayments.filter((payment) => payment.paymentDate >= paymentPeriod.from && payment.paymentDate <= paymentPeriod.to);
  const paymentReversals = paymentPeriod.error ? [] : allTempoReversals.filter((reversal) => reversal.reversalDate >= paymentPeriod.from && reversal.reversalDate <= paymentPeriod.to);
  const paymentBreakdown = buildPaymentBreakdown(paymentSales, rekeningLabels, paymentTempo, paymentReversals);
  paymentPeriod.transactionCount = paymentSales.filter((sale) => sale.approvalStatus === "approved" && (sale.paymentMethod === "Cash" || sale.paymentMethod === "TF")).length + paymentTempo.filter((payment) => payment.paymentMethod === "Cash" || payment.paymentMethod === "TF").length;
  const rekenings = rekeningOptions(allSales, allRekenings);
  const whatsappStatus = getWhatsappProviderStatus();
  const dataSourceNotice = dashboardDataSourceNotice();
  const activeFilters = activeFilterLabels(params);

  return (
    <AppShell>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Ringkasan operasional</p>
          <h2 className="aj-page-title mt-2 text-3xl font-bold">Halo, {user.name}</h2>
          <p className="mt-2 text-sm text-slate-600">Pantau penjualan, pengeluaran, dan stok dalam satu tampilan.</p>
        </div>
        {can(role, "penjualan.create") && <Link href="/penjualan/input"><Button>+ Input Penjualan</Button></Link>}
      </div>
      {dataSourceNotice && <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">{dataSourceNotice}</p>}
      {operationalProfit && <section className="mt-7">
        <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">OPERASIONAL</p>
            <h3 className="text-lg font-bold tracking-tight">Profit Operasional</h3>
          </div>
          <Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-800" href="/settings/profit-slm">Atur Gross Profit {operationalProfit.grossProfitPercent.toLocaleString("id-ID", { maximumFractionDigits: 2 })}% →</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard testId="dashboard-kpi-operational-month-revenue" label="Omset operasional bulan ini" value={formatDashboardMoney(operationalProfit.monthlyRevenue)} change={`${operationalProfit.monthlySalesCount} transaksi operasional`} tone="blue" />
          <KpiCard testId="dashboard-kpi-operational-month-expenses" label="Pengeluaran operasional bulan ini" value={formatDashboardMoney(operationalProfit.monthlyExpenses)} change="Expense approved operasional" tone="orange" />
          <KpiCard testId="dashboard-kpi-operational-today-revenue" label="Omset operasional hari ini" value={formatDashboardMoney(operationalProfit.todayRevenue)} change={`${operationalProfit.todaySalesCount} transaksi hari ini`} tone="violet" />
          <KpiCard testId="dashboard-kpi-operational-today-expenses" label="Pengeluaran operasional hari ini" value={formatDashboardMoney(operationalProfit.todayExpenses)} change="Expense approved hari ini" tone="orange" />
          <KpiCard testId="dashboard-kpi-operational-gross-profit" label="Gross Profit Operasional" value={formatDashboardMoney(operationalProfit.grossProfit)} change={`Gross Profit ${operationalProfit.grossProfitPercent.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`} tone="green" />
          <KpiCard testId="dashboard-kpi-operational-nett-profit" label="Nett Profit Operasional" value={formatDashboardMoney(operationalProfit.nettProfit)} change="Gross Profit - pengeluaran bulanan" tone={operationalProfit.nettProfit >= 0 ? "green" : "orange"} />
        </div>
      </section>}

      <ResponsiveFilterPanel
        title="Filter dashboard"
        resetHref="/dashboard"
        activeFilters={activeFilters}
        emptyText="Filter aktif: semua dashboard."
        className="mt-5"
        formClassName="grid gap-3 md:grid-cols-4 xl:grid-cols-6"
        actionsClassName="md:col-span-4 xl:col-span-2"
      >
        <label className="text-sm font-medium text-slate-700">Dari tanggal<Input type="date" name="from" defaultValue={valueOf(params, "from") || ""} className="mt-1" /></label>
        <label className="text-sm font-medium text-slate-700">Sampai tanggal<Input type="date" name="to" defaultValue={valueOf(params, "to") || ""} className="mt-1" /></label>
        <label className="text-sm font-medium text-slate-700">Pembayaran<Select name="paymentMethod" defaultValue={valueOf(params, "paymentMethod") || ""} className="mt-1"><option value="">Semua</option>{paymentMethods.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
        <label className="text-sm font-medium text-slate-700">Rekening / bank<Select name="rekening" defaultValue={valueOf(params, "rekening") || ""} className="mt-1"><option value="">Semua</option>{rekenings.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></label>
      </ResponsiveFilterPanel>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,.9fr)]">
        <PerformanceChart data={performance} />
        <PaymentBreakdownChart key={`${paymentPeriod.mode}:${paymentPeriod.from}:${paymentPeriod.to}`} data={paymentBreakdown} filters={{ from: paymentPeriod.from, to: paymentPeriod.to }} period={paymentPeriod} preservedParams={preservedDashboardParams(params)} />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.85fr)]">
        <section className="aj-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <div><p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Aktivitas</p><h2 className="mt-1 text-lg font-bold tracking-tight">Aktivitas terbaru</h2></div>
            <Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-800" href="/barang">Lihat barang →</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                  <span className={`grid h-9 w-9 place-items-center rounded-xl text-sm ${activity.entityType === "sales" ? "bg-emerald-50 text-emerald-700" : activity.entityType === "expense" ? "bg-slate-100 text-slate-700" : "bg-slate-100 text-slate-600"}`}>{activity.entityType === "sales" ? "↗" : activity.entityType === "expense" ? "−" : "◇"}</span>
                  <div><p className="font-semibold text-slate-800">{activityText(activity)}</p><time className="text-xs text-slate-500">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(activity.createdAt))}</time></div>
                </div>
                <span className="text-xs font-semibold text-emerald-600">{activityStatusText(activity)}</span>
              </div>
            ))}
            {activities.length === 0 && <p className="px-5 py-8 text-sm text-slate-500">Riwayat aktivitas belum tersedia.</p>}
          </div>
        </section>
        <section className="aj-surface p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Koneksi</p>
          <h2 className="mt-1 text-lg font-bold tracking-tight">Status sistem</h2>
          <Status label="ERP Integration API" ok={products.success} text={products.success ? "Terhubung dan siap digunakan" : products.message} />
          <Status label="OpenCloud Storage" ok={cloud.configured} text={cloud.message} />
          <Status label="WhatsApp" ok={whatsappStatus.ready} text={whatsappStatus.message} />
          <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-950">
            <p className="text-sm font-semibold">Butuh transaksi cepat?</p>
            <Link href="/pengeluaran/input" className="mt-2 inline-block text-sm font-semibold text-emerald-700 hover:text-emerald-800">Input pengeluaran →</Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Status({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  return (
    <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3.5">
      <div className="flex items-center gap-2 text-sm font-semibold"><span className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />{label}</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
    </div>
  );
}
