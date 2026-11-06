import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ResponsiveFilterPanel } from "@/components/ui/ResponsiveFilterPanel";
import { Select } from "@/components/ui/Select";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { PaymentBreakdownChart, type PaymentPeriod } from "@/components/dashboard/PaymentBreakdownChart";
import { salePaymentParts } from "@/lib/sales/payments";
import { listCatalogProducts } from "@/lib/inventory/catalog";
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
import { CctvDashboardWidget } from "@/components/dashboard/CctvDashboardWidget";
import { getCctvDashboardSummary } from "@/lib/cctv/store";
import { getConfiguredCameraStreams } from "@/lib/cctv/streams";

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
function paymentPeriodFromParams(params: SearchParams, currentMonth: string, today: string): PaymentPeriod {
  const requestedMode = valueOf(params, "paymentPeriod");
  // Bawaan: hari ini. Bisa diganti ke satu bulan atau rentang tanggal.
  const mode: PaymentPeriod["mode"] = requestedMode === "month" || requestedMode === "day-range" ? requestedMode : "day";
  const month = /^\d{4}-\d{2}$/.test(valueOf(params, "paymentMonth") || "") ? valueOf(params, "paymentMonth") as string : currentMonth;
  const day = validDayKey(valueOf(params, "paymentDate")) ? valueOf(params, "paymentDate") as string : today;
  const dayFrom = validDayKey(valueOf(params, "paymentFrom")) ? valueOf(params, "paymentFrom") as string : `${currentMonth}-01`;
  const dayTo = validDayKey(valueOf(params, "paymentTo")) ? valueOf(params, "paymentTo") as string : today;
  const from = mode === "day" ? day : mode === "month" ? `${month}-01` : dayFrom;
  const to = mode === "day" ? day : mode === "month" ? monthEnd(month) : dayTo;
  const error = from > to ? "Periode awal tidak boleh melewati periode akhir." : undefined;
  const label = error ? "Periode tidak valid" : mode === "day" ? (day === today ? `Hari ini (${day})` : `Tanggal ${day}`) : mode === "month" ? `Bulan ${month}` : `${from} sampai ${to}`;
  return { mode, day, month, from, to, label, transactionCount: 0, error };
}

function preservedDashboardParams(params: SearchParams) {
  const paymentKeys = new Set(["paymentPeriod", "paymentDate", "paymentMonth", "paymentFrom", "paymentTo"]);
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
    for (const part of salePaymentParts(sale)) {
      const value = part.rekeningId || part.rekeningNameSnapshot;
      const label = part.rekeningNameSnapshot || part.transferAccount || part.rekeningId;
      if (value && label) options.set(value, label);
    }
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
  const products = await listCatalogProducts();
  const cloud = getOpenCloudStatus();
  const audit = await listAudit({ role });
  const activities = audit.slice(0, 5);

  const todayStr = jakartaDateKey();
  const monthStr = jakartaMonthKey();
  const paymentPeriod = paymentPeriodFromParams(params, monthStr, todayStr);
  const allSales = await listSalesRecords();
  const isOwner = role === "OWNER";
  const [allExpenses, allRekenings, allTempoPayments, allTempoReversals, cctvSummary] = await Promise.all([
    listExpenseRecords(),
    listRekeningAccounts(),
    listTempoPayments(),
    listTempoPaymentReversals(),
    isOwner ? getCctvDashboardSummary().catch(() => null) : Promise.resolve(null),
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
  const effectiveGrossProfitPercent = (profitSetting && profitSetting.grossProfitPercent > 0) ? profitSetting.grossProfitPercent : 10;
  const operationalProfit = canViewOperationalProfit && profitSetting
    ? buildOperationalProfitSummary(allSales, allExpenses, todayStr, monthStr, effectiveGrossProfitPercent, products.success ? products.data : [])
    : null;
  const performance = buildMonthlyPerformance(
    filteredSales,
    filteredExpenses,
    new Date(),
    { from: filters.from, to: filters.to },
    effectiveGrossProfitPercent,
    products.success ? products.data : []
  );
  const paymentSales = paymentPeriod.error ? [] : filterDashboardSales(allSales, { from: paymentPeriod.from, to: paymentPeriod.to });
  const paymentTempo = paymentPeriod.error ? [] : allTempoPayments.filter((payment) => payment.paymentDate >= paymentPeriod.from && payment.paymentDate <= paymentPeriod.to);
  const paymentReversals = paymentPeriod.error ? [] : allTempoReversals.filter((reversal) => reversal.reversalDate >= paymentPeriod.from && reversal.reversalDate <= paymentPeriod.to);
  const paymentBreakdown = buildPaymentBreakdown(paymentSales, rekeningLabels, paymentTempo, paymentReversals);
  paymentPeriod.transactionCount = paymentSales.filter((sale) => sale.approvalStatus === "approved" && (sale.paymentMethod === "Cash" || sale.paymentMethod === "TF" || sale.paymentMethod === "Split")).length + paymentTempo.filter((payment) => payment.paymentMethod === "Cash" || payment.paymentMethod === "TF").length;
  const rekenings = rekeningOptions(allSales, allRekenings);
  const whatsappStatus = getWhatsappProviderStatus();
  // Ringkasan transaksi MJ khusus Super Admin.
  const mjStats = isOwner ? (() => {
    const mj = allSales.filter((sale) => sale.approvalStatus === "approved" && (sale.source === "MJ" || sale.createdByUserId === "integration:mj"));
    const today = mj.filter((sale) => sale.saleDate === todayStr);
    const month = mj.filter((sale) => sale.saleDate?.startsWith(monthStr));
    const sum = (rows: typeof mj) => rows.reduce((total, sale) => total + (Number(sale.total) || 0), 0);
    return { todayCount: today.length, todayTotal: sum(today), monthCount: month.length, monthTotal: sum(month) };
  })() : null;
  const dataSourceNotice = dashboardDataSourceNotice();
  const activeFilters = activeFilterLabels(params);

  return (
    <AppShell>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="aj-page-title text-2xl font-bold sm:text-3xl">Halo, {user.name}</h2>
        </div>
        {can(role, "penjualan.create") && <Link href="/penjualan/input"><Button>+ Input Penjualan</Button></Link>}
      </div>
      {dataSourceNotice && <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">{dataSourceNotice}</p>}
      {operationalProfit && (
        <section className="mt-7" aria-labelledby="ringkasan-heading">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h3 id="ringkasan-heading" className="text-lg font-bold tracking-tight">Ringkasan penjualan</h3>
            <div className="flex flex-wrap gap-4 text-sm font-semibold">
              <Link className="text-emerald-800 hover:underline" href="/dashboard/detail">Rincian laba</Link>
              <Link className="text-emerald-800 hover:underline" href="/settings/profit-slm">
                Atur estimasi GP {operationalProfit.grossProfitPercent.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%
              </Link>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SummaryPanel title="Hari ini">
              <SummaryRow testId="dashboard-kpi-operational-today-revenue" label="Omset" note={`${operationalProfit.todaySalesCount} transaksi`} value={formatDashboardMoney(operationalProfit.todayRevenue)} />
              <SummaryRow testId="dashboard-kpi-operational-today-cogs" label="Modal" note="Harga RMB + ongkir CBM, dari Master Barang" value={formatDashboardMoney(operationalProfit.todayCogs)} />
              <SummaryRow testId="dashboard-kpi-operational-today-gross-profit" label="Gross profit" note="Omset − modal" value={formatDashboardMoney(operationalProfit.todayGrossProfit)} negative={operationalProfit.todayGrossProfit < 0} />
              <SummaryRow testId="dashboard-kpi-operational-today-expenses" label="Pengeluaran" note="Disetujui hari ini" value={formatDashboardMoney(operationalProfit.todayExpenses)} />
              <SummaryRow testId="dashboard-kpi-operational-today-nett-profit" label="Nett profit" note="Gross profit − pengeluaran" value={formatDashboardMoney(operationalProfit.todayNettProfit)} negative={operationalProfit.todayNettProfit < 0} />
              {mjStats && <SummaryRow testId="dashboard-mj-today" label="Transaksi MJ" note={`${mjStats.todayCount} transaksi`} value={formatDashboardMoney(mjStats.todayTotal)} />}
            </SummaryPanel>
            <SummaryPanel title="Bulan ini">
              <SummaryRow testId="dashboard-kpi-operational-month-revenue" label="Omset" note={`${operationalProfit.monthlySalesCount} transaksi${operationalProfit.hasMjSales ? " · MJ tanpa markup 10%" : ""}`} value={formatDashboardMoney(operationalProfit.monthlyRevenue)} />
              <SummaryRow
                testId="dashboard-kpi-operational-month-cogs"
                label="Modal"
                note={operationalProfit.monthlyEstimatedSalesCount ? `${operationalProfit.monthlyEstimatedSalesCount} nota sebagian modalnya estimasi GP ${operationalProfit.grossProfitPercent.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%` : "Modal barang yang terjual"}
                value={formatDashboardMoney(operationalProfit.monthlyCogs)}
              />
              <SummaryRow testId="dashboard-kpi-operational-gross-profit" label="Gross profit" note="Omset − modal" value={formatDashboardMoney(operationalProfit.grossProfit)} negative={operationalProfit.grossProfit < 0} />
              <SummaryRow testId="dashboard-kpi-operational-month-expenses" label="Pengeluaran" note="Disetujui bulan ini" value={formatDashboardMoney(operationalProfit.monthlyExpenses)} />
              <SummaryRow testId="dashboard-kpi-operational-nett-profit" label="Nett profit" note="Gross profit − pengeluaran" value={formatDashboardMoney(operationalProfit.nettProfit)} negative={operationalProfit.nettProfit < 0} />
              {mjStats && <SummaryRow testId="dashboard-mj-month" label="Transaksi MJ" note={`${mjStats.monthCount} transaksi`} value={formatDashboardMoney(mjStats.monthTotal)} />}
            </SummaryPanel>
          </div>
        </section>
      )}

      {cctvSummary && (
        <CctvDashboardWidget
          summary={cctvSummary}
          cameraStreams={isOwner ? getConfiguredCameraStreams(cctvSummary.liveSystem?.cameras) : []}
        />
      )}

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
          <Status label="Master Barang SLM" ok={products.success && products.data.length > 0} text={products.success ? `${products.data.length.toLocaleString("id-ID")} barang · sumber harga modal dashboard` : products.message} />
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

function SummaryPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="aj-surface p-4 sm:p-5">
      <h4 className="text-sm font-semibold text-slate-600">{title}</h4>
      <dl className="mt-2 divide-y divide-slate-100">{children}</dl>
    </section>
  );
}

function SummaryRow({ label, note, value, testId, negative = false }: { label: string; note: string; value: string; testId?: string; negative?: boolean }) {
  return (
    <div data-testid={testId} className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{note}</span>
      </dt>
      <dd className={`shrink-0 text-lg font-bold tabular-nums ${negative ? "text-red-700" : "text-slate-900"}`}>{value}</dd>
    </div>
  );
}
