import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PenjualanForm } from "@/components/forms/PenjualanForm";
import { ErrorState } from "@/components/ui/ErrorState";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getCurrentUser } from "@/lib/auth/session";
import { getSalesRecord } from "@/lib/sales/store";
import { listBookkeepingTypes, listRekeningAccounts } from "@/lib/business/masterData";
import { erpSalesTypeCodes } from "@/lib/api/sales";

export const dynamic = "force-dynamic";

export default async function EditPenjualanPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("penjualan.manage");
  const { id } = await params;
  const [sale, tipes, rekenings, user] = await Promise.all([getSalesRecord(id), listBookkeepingTypes(), listRekeningAccounts(), getCurrentUser()]);
  if (!sale) notFound();
  const blocked = sale.syncTarget === "erp" && sale.syncStatus === "synced";
  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-neutral-500">Transaksi</p>
        <h2 className="aj-page-title text-3xl font-bold">Edit Penjualan</h2>
        <p className="mt-2 text-sm text-slate-600">Edit hanya dibuka untuk transaksi yang belum final/synced ke ERP.</p>
      </div>
      {blocked ? <ErrorState message="Transaksi AJ sudah tersinkron ke Aneka Jaya ERP. Edit langsung diblokir sampai tersedia mekanisme koreksi resmi." /> : <PenjualanForm sale={sale} tipes={tipes} rekenings={rekenings} allowTestTransaction={user.role === "OWNER"} erpTypeCodes={Array.from(erpSalesTypeCodes())} />}
    </AppShell>
  );
}
