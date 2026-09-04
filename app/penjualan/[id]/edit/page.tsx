import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorState } from "@/components/ui/ErrorState";
import { PenjualanForm } from "@/components/forms/PenjualanForm";
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
  if (sale.source === "MJ") notFound();

  const isCancelled = sale.approvalStatus === "cancelled";

  return (
    <AppShell>
      <div className="mb-7">
        <div className="mb-2 flex items-center gap-2">
          {sale.approvalStatus === "draft" ? (
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
              Draft Penjualan
            </span>
          ) : (
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Transaksi</p>
          )}
        </div>
        <h2 className="aj-page-title text-3xl font-bold">
          {sale.approvalStatus === "draft" ? "Lanjutkan Draft Penjualan" : "Edit Penjualan"}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {isCancelled
            ? "Transaksi ini sudah dibatalkan dan tidak dapat diubah."
            : sale.approvalStatus === "draft"
              ? "Perbarui data pesanan atau klik 'Finalkan & Simpan Penjualan' untuk memotong stok gudang Aneka Jaya."
              : "Edit transaksi penjualan yang tersimpan."}
        </p>
      </div>
      {isCancelled ? (
        <ErrorState message="Transaksi yang sudah dibatalkan tidak dapat diedit." />
      ) : (
        <PenjualanForm sale={sale} tipes={tipes} rekenings={rekenings} allowTestTransaction={user.role === "OWNER"} erpTypeCodes={Array.from(erpSalesTypeCodes())} />
      )}
    </AppShell>
  );
}
