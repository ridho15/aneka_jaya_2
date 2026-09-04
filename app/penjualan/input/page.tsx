import { AppShell } from "@/components/layout/AppShell";
import { PenjualanForm } from "@/components/forms/PenjualanForm";
import {
  listBookkeepingTypes,
  listRekeningAccounts,
} from "@/lib/business/masterData";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getCurrentUser } from "@/lib/auth/session";
import { erpSalesTypeCodes } from "@/lib/api/sales";

export const dynamic = "force-dynamic";

export default async function InputPenjualanPage() {
  await requirePermission("penjualan.create");
  const [tipes, rekenings, user] = await Promise.all([
    listBookkeepingTypes(),
    listRekeningAccounts(),
    getCurrentUser(),
  ]);
  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">
          Transaksi
        </p>
        <h2 className="aj-page-title text-3xl font-bold">Input Penjualan</h2>
        <p className="mt-2 text-sm text-slate-600">
          Masukkan transaksi penjualan dan barang yang dijual.
        </p>
      </div>
      <PenjualanForm
        tipes={tipes}
        rekenings={rekenings}
        allowTestTransaction={user.role === "OWNER"}
        erpTypeCodes={Array.from(erpSalesTypeCodes())}
      />
    </AppShell>
  );
}
