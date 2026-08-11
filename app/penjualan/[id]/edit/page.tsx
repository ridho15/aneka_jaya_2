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
  const needsCancelAndRecreate =
    sale.syncTarget === "erp" &&
    (sale.stockReleaseStatus === "released" || sale.erpPaymentStatus === "paid" || sale.erpPaymentStatus === "partial");
  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-neutral-500">Transaksi</p>
        <h2 className="aj-page-title text-3xl font-bold">Edit Penjualan</h2>
        <p className="mt-2 text-sm text-slate-600">
          {needsCancelAndRecreate
            ? "Transaksi ini sudah masuk proses lanjutan di ERP. Gunakan cancel/void lalu buat transaksi koreksi baru."
            : sale.syncTarget === "erp" && sale.syncStatus === "synced"
              ? "Transaksi sudah tersinkron ERP. Perubahan akan masuk antrean update ERP dan dikirim memakai PUT dengan ERP reference yang sama."
            : "Edit transaksi penjualan yang tersimpan."}
        </p>
      </div>
      {needsCancelAndRecreate ? (
        <div className="space-y-4">
          <ErrorState message="ERP menolak update transaksi karena transaksi sudah masuk proses lanjutan. Batalkan transaksi lama di ERP lalu buat transaksi koreksi baru dengan ERP reference baru." />
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Langkah aman:</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Cancel transaksi lama di ERP.</li>
              <li>Pastikan stock release, payment, dan dokumen turunan sudah direversal.</li>
              <li>Buat transaksi koreksi baru dengan ERP reference baru.</li>
            </ol>
          </div>
        </div>
      ) : (
        <PenjualanForm sale={sale} tipes={tipes} rekenings={rekenings} allowTestTransaction={user.role === "OWNER"} erpTypeCodes={Array.from(erpSalesTypeCodes())} />
      )}
    </AppShell>
  );
}
