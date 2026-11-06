import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ShipmentImportForm } from "@/components/inventory/ShipmentImportForm";
import { InventoryHeader } from "@/components/inventory/ui";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listLocations } from "@/lib/inventory/service";

export const dynamic = "force-dynamic";

export default async function PackingListImportPage() {
  const role = await getCurrentRole();
  if (!can(role, "inventory.master")) redirect("/no-access");
  const locations = await listLocations();
  return (
    <AppShell>
      <InventoryHeader
        title="Import Packing List"
        description={<>Unggah packing list supplier. Kode barang, nama, isi pcs, harga RMB dan CBM dibaca dari file, modal dihitung otomatis. Cek dulu tabelnya, ubah isi pcs atau nama bila perlu, lalu simpan. <Link className="text-emerald-800 underline" href="/inventory/produk">Kurs RMB & tarif CBM</Link></>}
      />
      <ShipmentImportForm locations={locations} />
    </AppShell>
  );
}
