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
  if (!can(role, "inventory.import")) redirect("/no-access");
  const locations = await listLocations();
  return (
    <AppShell>
      <InventoryHeader
        title="Import Opname Excel"
        description={<>Unggah file Excel <i>Stock Opname Aneka Jaya</i> (sheet Opname). Barang baru dibuat otomatis, lalu stok tiap lokasi diganti sesuai hitungan di file. Klik <b>Cek Dulu</b> sebelum menyimpan.</>}
      />
      {locations.length ? <OpnameImportForm locations={locations} /> : (
        <p className="aj-surface p-5 text-sm">Belum ada gudang/toko. Buat dulu di <Link className="text-emerald-800 underline" href="/inventory/lokasi">Lokasi Stok</Link>.</p>
      )}
    </AppShell>
  );
}
