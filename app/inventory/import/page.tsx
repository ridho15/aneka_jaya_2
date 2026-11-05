import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { OpnameImportForm } from "@/components/inventory/OpnameImportForm";
import { InventoryHeader } from "@/components/inventory/ui";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listLocations } from "@/lib/inventory/service";

export const dynamic = "force-dynamic";

export default async function ImportOpnamePage() {
  const role = await getCurrentRole();
  if (!can(role, "inventory.adjust")) redirect("/no-access");
  const locations = await listLocations();
  return (
    <AppShell>
      <InventoryHeader
        title="Import Opname dari Excel"
        description={<>Unggah file &quot;Stock Opname Aneka Jaya&quot; (sheet <b>Opname</b>: Kode, Nama Produk, Kategori, Satuan, Modal, Koli/Lepas/Qty Gudang, Koli/Lepas/Qty Toko). Barang yang belum ada dibuat otomatis, lalu stok tiap lokasi diganti dengan hasil hitung di file. Preview dulu sebelum posting.</>}
      />
      {locations.length ? <OpnameImportForm locations={locations} /> : (
        <p className="aj-surface p-5 text-sm">Belum ada gudang/toko. Buat dulu di <Link className="text-emerald-700 underline" href="/inventory/lokasi">Gudang &amp; Toko</Link>.</p>
      )}
    </AppShell>
  );
}
