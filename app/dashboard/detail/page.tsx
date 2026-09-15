import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/Page";
import { ResponsiveFilterPanel } from "@/components/ui/ResponsiveFilterPanel";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { listSalesRecords } from "@/lib/sales/store";
import { listExpenseRecords } from "@/lib/expenses/store";
import { getOperationalProfitSetting } from "@/lib/settings/profit";
import { listBookkeepingTypes } from "@/lib/business/masterData";
import { listProducts } from "@/lib/api/products";
import { jakartaMonthKey } from "@/lib/date/jakarta";
import { buildDashboardProfitDetails } from "@/lib/dashboard/summary";
import { ProfitDetailView } from "@/components/dashboard/ProfitDetailView";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function valueOf(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardProfitDetailPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const role = await getCurrentRole();
  // Khusus OWNER, ADMIN, FINANCE yang berwenang melihat breakdown profitabilitas
  if (
    !can(role, "settings.profit.manage") &&
    !can(role, "reports.finance_view") &&
    role !== "OWNER"
  ) {
    redirect("/dashboard");
  }

  const params = (await searchParams) || {};
  const currentMonth = jakartaMonthKey();
  const selectedMonth =
    valueOf(params, "month") || (!valueOf(params, "from") ? currentMonth : undefined);
  const from =
    valueOf(params, "from") || (selectedMonth ? `${selectedMonth}-01` : undefined);
  const to =
    valueOf(params, "to") || (selectedMonth ? `${selectedMonth}-31` : undefined);
  const tipe = valueOf(params, "tipe") || undefined;

  const [sales, expenses, globalMarginSetting, tipes, productsRes] =
    await Promise.all([
      listSalesRecords(),
      listExpenseRecords(),
      getOperationalProfitSetting(),
      listBookkeepingTypes(),
      listProducts(),
    ]);

  const activeTipes = tipes.filter((t) => t.isActive && t.code !== "AJ");
  const products = productsRes.success && productsRes.data ? productsRes.data : [];

  const profitDetails = buildDashboardProfitDetails(
    sales,
    expenses,
    {
      from,
      to,
      tipe,
      fallbackMarginPercent: globalMarginSetting.grossProfitPercent,
    },
    products
  );

  const activeFilterLabels = [
    selectedMonth && !valueOf(params, "from") ? `Bulan: ${selectedMonth}` : null,
    valueOf(params, "from") ? `Dari: ${valueOf(params, "from")}` : null,
    valueOf(params, "to") ? `Sampai: ${valueOf(params, "to")}` : null,
    tipe ? `Tipe: ${tipe}` : null,
  ].filter(Boolean) as string[];

  return (
    <AppShell>
      <PageHeader
        eyebrow="Audit & Transparansi"
        title="Rincian Sumber Data Profitabilitas"
        description="Audit detail sumber data dari kalkulasi Omzet, Modal HPP, Gross Profit, Pengeluaran, dan Laba Bersih operasional."
      />

      <ResponsiveFilterPanel
        title="Filter periode audit profit"
        resetHref="/dashboard/detail"
        activeFilters={activeFilterLabels}
        emptyText="Filter periode aktif: bulan berjalan."
        className="mb-6"
        formClassName="grid gap-3 sm:grid-cols-2 md:grid-cols-4"
        actionsClassName="sm:col-span-2 md:col-span-4"
      >
        <label className="text-sm font-medium text-slate-700">
          Pilih Bulan
          <Input
            type="month"
            name="month"
            defaultValue={selectedMonth || ""}
            className="mt-1"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Atau Dari Tanggal
          <Input
            type="date"
            name="from"
            defaultValue={valueOf(params, "from") || ""}
            className="mt-1"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Sampai Tanggal
          <Input
            type="date"
            name="to"
            defaultValue={valueOf(params, "to") || ""}
            className="mt-1"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Tipe Transaksi
          <Select name="tipe" defaultValue={tipe || ""} className="mt-1">
            <option value="">Semua Tipe Operasional</option>
            {activeTipes.map((t) => (
              <option key={t.id} value={t.code}>
                {t.name} ({t.code})
              </option>
            ))}
          </Select>
        </label>
      </ResponsiveFilterPanel>

      <ProfitDetailView data={profitDetails} />
    </AppShell>
  );
}
