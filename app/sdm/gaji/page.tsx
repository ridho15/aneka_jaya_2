import { AppShell } from "@/components/layout/AppShell";
import { SalaryHistoryTable } from "@/components/sdm/SalaryHistoryTable";
import { requirePermission } from "@/lib/auth/requirePermission";
import { listSalaryPayments, getSalarySummary } from "@/lib/sdm/salaryStore";
import { jakartaDateKey } from "@/lib/date/jakarta";

export const dynamic = "force-dynamic";

export default async function SdmGajiPage({
  searchParams
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requirePermission("sdm.salary.view");
  const { period } = await searchParams;
  const currentMonth = jakartaDateKey().slice(0, 7);
  const activePeriod = period || currentMonth;

  const [items, summary] = await Promise.all([
    listSalaryPayments({}),
    getSalarySummary(activePeriod)
  ]);

  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">SDM & Personalia</p>
        <h2 className="aj-page-title text-3xl font-bold">Riwayat Penggajian (Gaji)</h2>
        <p className="mt-2 text-sm text-slate-600">
          Daftar pembayaran gaji karyawan berdasarkan transaksi pengeluaran riil perusahaan.
        </p>
      </div>

      <SalaryHistoryTable
        initialItems={items}
        initialSummary={summary}
        initialPeriod={period}
      />
    </AppShell>
  );
}
