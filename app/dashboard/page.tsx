import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { PaymentBreakdownChart } from "@/components/dashboard/PaymentBreakdownChart";
import { listProducts } from "@/lib/api/products";
import { getOpenCloudStatus } from "@/lib/opencloud/auth";
import { can } from "@/lib/auth/roles";
import { getCurrentRole, getCurrentUser } from "@/lib/auth/session";
import { listSalesRecords } from "@/lib/sales/store";
import { listExpenseRecords } from "@/lib/expenses/store";
import { listTempoReceivables } from "@/lib/tempo/store";
import { summarizeOpenTempo } from "@/lib/tempo/summary";
import { listAudit } from "@/lib/audit/store";
import { activityStatusText, activityText, buildDashboardSalesMetrics, buildMonthlyPerformance, buildPaymentBreakdown, filterDashboardSales, formatDashboardMoney, productKpi, type DashboardSalesFilters } from "@/lib/dashboard/summary";
import { jakartaDateKey, jakartaMonthKey } from "@/lib/date/jakarta";
import { getWhatsappProviderStatus } from "@/lib/whatsapp/whatsappClient";
import type { Sale } from "@/lib/types/sales";
import { listRekeningAccounts, type RekeningAccount } from "@/lib/business/masterData";

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

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const role = await getCurrentRole();
  if (!can(role, "dashboard.view")) redirect("/no-access");
  const user = await getCurrentUser();
  const params = await searchParams || {};
  const filters = dashboardFilters(params);
  const products = await listProducts();
  const cloud = getOpenCloudStatus();
  const audit = await listAudit({ role });
  const activities = audit.slice(0, 5);

  const todayStr = jakartaDateKey();
  const monthStr = jakartaMonthKey();
  const allSales = await listSalesRecords();
  const [allExpenses, allRekenings] = await Promise.all([
    listExpenseRecords(),
    listRekeningAccounts()
  ]);
  const rekeningLabels = rekeningLabelMap(allRekenings);
  const { salesThisMonth, salesToday, totalThisMonth, totalToday } = buildDashboardSalesMetrics(allSales, todayStr, monthStr);
  const filteredSales = filterDashboardSales(allSales, filters);
  const filteredExpenses = allExpenses.filter((expense) => {
    if (filters.from && expense.expenseDate < filters.from) return false;
    if (filters.to && expense.expenseDate > filters.to) return false;
    return true;
  });
  const allTempo = await listTempoReceivables();
  const { openTempo, openTempoAmount } = summarizeOpenTempo(allTempo);
  const performance = buildMonthlyPerformance(filteredSales, filteredExpenses);
  const paymentBreakdown = buildPaymentBreakdown(filteredSales, rekeningLabels);
  const productStats = productKpi(products.success, products.success ? products.data.length : 0, products.success ? undefined : products.message);
  const rekenings = rekeningOptions(allSales, allRekenings);
  const whatsappStatus = getWhatsappProviderStatus();

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
      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Penjualan bulan ini" value={formatDashboardMoney(totalThisMonth)} change={`${salesThisMonth.length} transaksi`} tone="blue" />
        <KpiCard label="Penjualan hari ini" value={formatDashboardMoney(totalToday)} change={`${salesToday.length} transaksi hari ini`} tone="violet" />
        <KpiCard label="Tempo terbuka" value={formatDashboardMoney(openTempoAmount)} change={`${openTempo.length} piutang belum lunas`} tone="orange" />
        <KpiCard label="Produk ERP" value={productStats.value} change={productStats.change} tone="green" />
      </div>

      <section className="aj-surface mt-5 p-5">
        <form className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
          <label className="text-sm font-medium text-slate-700">Dari tanggal<Input type="date" name="from" defaultValue={valueOf(params, "from") || ""} className="mt-1" /></label>
          <label className="text-sm font-medium text-slate-700">Sampai tanggal<Input type="date" name="to" defaultValue={valueOf(params, "to") || ""} className="mt-1" /></label>
          <label className="text-sm font-medium text-slate-700">Pembayaran<Select name="paymentMethod" defaultValue={valueOf(params, "paymentMethod") || ""} className="mt-1"><option value="">Semua</option>{paymentMethods.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
          <label className="text-sm font-medium text-slate-700">Rekening / bank<Select name="rekening" defaultValue={valueOf(params, "rekening") || ""} className="mt-1"><option value="">Semua</option>{rekenings.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></label>
          <div className="flex items-end gap-2 md:col-span-4 xl:col-span-2">
            <button className="rounded-sm bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700" type="submit">Filter</button>
            <Link className="rounded-sm border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" href="/dashboard">Reset</Link>
          </div>
        </form>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,.9fr)]">
        <PerformanceChart data={performance} />
        <PaymentBreakdownChart data={paymentBreakdown} />
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
                  <span className={`grid h-9 w-9 place-items-center rounded-xl text-sm ${activity.entityType === "sales" ? "bg-blue-100 text-blue-700" : activity.entityType === "expense" ? "bg-orange-100 text-orange-700" : "bg-violet-100 text-violet-700"}`}>{activity.entityType === "sales" ? "↗" : activity.entityType === "expense" ? "−" : "◇"}</span>
                  <div><p className="font-semibold text-slate-800">{activityText(activity)}</p><time className="text-xs text-slate-500">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(activity.createdAt))}</time></div>
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
