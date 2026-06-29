import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { CategoryChart } from "@/components/dashboard/CategoryChart";
import { listProducts } from "@/lib/api/products";
import { getOpenCloudStatus } from "@/lib/opencloud/auth";
import { can } from "@/lib/auth/roles";
import { getCurrentRole, getCurrentUser } from "@/lib/auth/session";
import { listSalesRecords } from "@/lib/sales/store";
import { listTempoReceivables } from "@/lib/tempo/store";
import { summarizeOpenTempo } from "@/lib/tempo/summary";
import { listAudit } from "@/lib/audit/store";
import { activityText, buildCategorySummary, buildMonthlyPerformance } from "@/lib/dashboard/summary";
import { getWhatsappProvider } from "@/lib/whatsapp/whatsappClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const role = await getCurrentRole();
  if (!can(role, "dashboard.view")) redirect("/no-access");
  const user = await getCurrentUser();
  const products = await listProducts();
  const cloud = getOpenCloudStatus();
  const audit = await listAudit({ role });
  const activities = audit.slice(0, 5);

  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStr = new Date().toISOString().slice(0, 7);
  const allSales = await listSalesRecords();
  const paidSales = allSales.filter((s) => s.approvalStatus === "approved");
  const salesThisMonth = paidSales.filter((s) => s.saleDate?.startsWith(monthStr));
  const salesToday = paidSales.filter((s) => s.saleDate === todayStr || s.createdAt?.startsWith(todayStr));
  const totalThisMonth = salesThisMonth.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalToday = salesToday.reduce((sum, s) => sum + (s.total || 0), 0);
  const allTempo = await listTempoReceivables();
  const { openTempo, openTempoAmount } = summarizeOpenTempo(allTempo);
  const performance = buildMonthlyPerformance(allSales, audit);
  const categories = buildCategorySummary(paidSales, products.success ? products.data : []);
  const whatsappProvider = getWhatsappProvider();

  const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0, notation: "compact" }).format(value);

  return (
    <AppShell>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.13em] text-blue-600">Ringkasan operasional</p>
          <h2 className="aj-page-title mt-2 text-3xl font-bold">Halo, {user.name}</h2>
          <p className="mt-2 text-sm text-slate-600">Pantau penjualan, pengeluaran, dan stok dalam satu tampilan.</p>
        </div>
        {can(role, "penjualan.create") && <Link href="/penjualan/input"><Button>+ Input Penjualan</Button></Link>}
      </div>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Penjualan bulan ini" value={rupiah(totalThisMonth)} change={`${salesThisMonth.length} transaksi`} tone="blue" />
        <KpiCard label="Penjualan hari ini" value={rupiah(totalToday)} change={`${salesToday.length} transaksi hari ini`} tone="violet" />
        <KpiCard label="Tempo terbuka" value={rupiah(openTempoAmount)} change={`${openTempo.length} piutang belum lunas`} tone="orange" />
        <KpiCard label="Produk ERP" value={`${products.success ? products.data.length : 0} item`} change="Semua gudang terpantau" tone="green" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,.9fr)]">
        <PerformanceChart data={performance} />
        <CategoryChart data={categories} />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.85fr)]">
        <section className="aj-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <div><p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Aktivitas</p><h2 className="mt-1 text-lg font-bold tracking-tight">Aktivitas terbaru</h2></div>
            <Link className="text-sm font-semibold text-blue-600" href="/barang">Lihat barang →</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                  <span className={`grid h-9 w-9 place-items-center rounded-xl text-sm ${activity.entityType === "sales" ? "bg-blue-100 text-blue-700" : activity.entityType === "expense" ? "bg-orange-100 text-orange-700" : "bg-violet-100 text-violet-700"}`}>{activity.entityType === "sales" ? "↗" : activity.entityType === "expense" ? "−" : "◇"}</span>
                  <div><p className="font-semibold text-slate-800">{activityText(activity)}</p><time className="text-xs text-slate-500">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(activity.createdAt))}</time></div>
                </div>
                <span className="text-xs font-semibold text-emerald-600">Selesai</span>
              </div>
            ))}
            {activities.length === 0 && <p className="px-5 py-8 text-sm text-slate-500">Riwayat aktivitas belum tersedia.</p>}
          </div>
        </section>
        <section className="aj-surface p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.13em] text-cyan-600">Koneksi</p>
          <h2 className="mt-1 text-lg font-bold tracking-tight">Status sistem</h2>
          <Status label="ERP Integration API" ok={products.success} text={products.success ? "Terhubung dan siap digunakan" : products.message} />
          <Status label="OpenCloud Storage" ok={cloud.configured} text={cloud.message} />
          <Status label="WhatsApp" ok={Boolean(whatsappProvider)} text={whatsappProvider ? `Provider ${whatsappProvider} siap digunakan` : "Provider WhatsApp belum dikonfigurasi"} />
          <div className="mt-5 rounded-xl bg-slate-950 p-4 text-white">
            <p className="text-sm font-semibold">Butuh transaksi cepat?</p>
            <Link href="/pengeluaran/input" className="mt-2 inline-block text-sm font-semibold text-cyan-300">Input pengeluaran →</Link>
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
