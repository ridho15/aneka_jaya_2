import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { RoleSelector } from "@/components/settings/RoleSelector";
import { isDemoRoleSelectorEnabled } from "@/lib/auth/demoUi";
import { getCurrentRole } from "@/lib/auth/session";
import { can, roleLabel } from "@/lib/auth/roles";
import { getWhatsappProvider } from "@/lib/whatsapp/whatsappClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const role = await getCurrentRole();
  if (!can(role, "settings.view")) redirect("/no-access");
  const mode = process.env.NEXT_PUBLIC_APP_MODE === "production" ? "Produksi" : "Development";
  const whatsappProvider = getWhatsappProvider();
  const isOwner = can(role, "settings.tipe.manage");
  const showRoleSelector = isDemoRoleSelectorEnabled();

  return (
    <AppShell>
      <div className="mb-7">
        <h2 className="aj-page-title text-3xl font-bold">Pengaturan</h2>
        <p className="mt-2 text-sm text-slate-600">Konfigurasi aplikasi, role, rekening, approval, tempo, dan WhatsApp.</p>
      </div>
      <section className="aj-surface max-w-2xl p-5 sm:p-6">
        <dl className="divide-y divide-slate-100 text-sm">
          <Row label="Mode aplikasi" value={mode} />
          <Row label="ERP API" value={process.env.ANIKA_ERP_API_BASE_URL ? "Dikonfigurasi di server" : "Belum dikonfigurasi"} />
          <Row label="WhatsApp provider" value={whatsappProvider || "Belum dikonfigurasi"} />
          <Row label="Peran aktif" value={roleLabel(role)} />
        </dl>
        <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Token ERP dan WhatsApp tidak pernah ditampilkan di halaman ini. Semua integrasi berjalan server-side.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {isOwner && (
            <>
              <Link className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-emerald-400 hover:bg-emerald-50" href="/settings/tipe">
                <div><p className="font-semibold text-slate-800">Tipe Pembukuan</p><p className="mt-0.5 text-xs text-slate-500">Kelola tipe transaksi (AJ, W, Online, …)</p></div>
              </Link>
              <Link className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-emerald-400 hover:bg-emerald-50" href="/settings/rekening">
                <div><p className="font-semibold text-slate-800">Rekening</p><p className="mt-0.5 text-xs text-slate-500">Kelola rekening bank / kas per tipe</p></div>
              </Link>
              <Link className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-slate-400 hover:bg-slate-50" href="/settings/users">
                <div><p className="font-semibold text-slate-800">Users</p><p className="mt-0.5 text-xs text-slate-500">Kelola login internal dan role database</p></div>
              </Link>
            </>
          )}
          <Link className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-emerald-400 hover:bg-emerald-50" href="/settings/whatsapp">
            <div><p className="font-semibold text-slate-800">WhatsApp</p><p className="mt-0.5 text-xs text-slate-500">Konfigurasi provider dan nomor tujuan</p></div>
          </Link>
          <Link className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-amber-400 hover:bg-amber-50" href="/approval">
            <div><p className="font-semibold text-slate-800">Approval</p><p className="mt-0.5 text-xs text-slate-500">Approve / reject transaksi tertunda</p></div>
          </Link>
          <Link className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-emerald-400 hover:bg-emerald-50" href="/tempo">
            <div><p className="font-semibold text-slate-800">Tempo</p><p className="mt-0.5 text-xs text-slate-500">Kelola piutang tempo pelanggan</p></div>
          </Link>
          <Link className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-slate-400 hover:bg-slate-50" href="/audit-trail">
            <div><p className="font-semibold text-slate-800">Audit Trail</p><p className="mt-0.5 text-xs text-slate-500">Lihat riwayat perubahan data</p></div>
          </Link>
        </div>
      </section>
      {showRoleSelector && <RoleSelector currentRole={role} />}
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 py-3">
      <dt className="font-medium text-slate-600">{label}</dt>
      <dd className="text-right text-slate-900">{value}</dd>
    </div>
  );
}
