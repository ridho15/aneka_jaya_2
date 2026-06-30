import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PengeluaranForm } from "@/components/forms/PengeluaranForm";
import { ErrorState } from "@/components/ui/ErrorState";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getExpenseRecord } from "@/lib/expenses/store";
import { listBookkeepingTypes, listRekeningAccounts } from "@/lib/business/masterData";

export const dynamic = "force-dynamic";

export default async function EditPengeluaranPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("pengeluaran.manage");
  const { id } = await params;
  const [expense, tipes, rekenings] = await Promise.all([getExpenseRecord(id), listBookkeepingTypes(), listRekeningAccounts()]);
  if (!expense) notFound();
  const blocked = expense.erpSyncTarget === "erp" && expense.erpSyncStatus === "synced";
  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-neutral-500">Keuangan</p>
        <h2 className="aj-page-title text-3xl font-bold">Edit Pengeluaran</h2>
        <p className="mt-2 text-sm text-slate-600">Edit hanya dibuka untuk pengeluaran yang belum final/synced ke ERP.</p>
      </div>
      {blocked ? <ErrorState message="Pengeluaran AJ sudah tersinkron ke Aneka Jaya ERP. Edit langsung diblokir sampai tersedia mekanisme koreksi resmi." /> : <PengeluaranForm expense={expense} tipes={tipes} rekenings={rekenings} />}
    </AppShell>
  );
}
