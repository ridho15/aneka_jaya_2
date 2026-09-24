import { AppShell } from "@/components/layout/AppShell";
import { LogoutButton } from "@/components/layout/LogoutButton";
import { RoleSelector } from "@/components/settings/RoleSelector";
import { isDemoRoleSelectorEnabled } from "@/lib/auth/demoUi";
import { resolveAuthProvider } from "@/lib/auth/request";
import { getCurrentRole } from "@/lib/auth/session";
import Link from "next/link";

export default async function NoAccessPage() {
  const role = await getCurrentRole();
  const showRoleSelector = isDemoRoleSelectorEnabled();
  const provider = resolveAuthProvider();
  const showLoginLink = !showRoleSelector && (provider === "trusted_header" || provider === "local_credentials" || provider === "anika_erp");
  return (
    <AppShell>
      <section className="aj-surface max-w-xl p-8">
        <p className="text-xs font-bold uppercase tracking-[0.13em] text-red-600">No access</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight">Akses belum diberikan</h2>
        <p className="mt-3 text-sm text-slate-600">
          Role ini ({role}) belum memiliki izin halaman yang boleh dibuka. Pastikan role pengguna di ERP Aneka Jaya sudah diatur dengan benar (misal: <strong>Delivery Driver</strong> untuk petugas pengiriman, <strong>Admin</strong>, atau <strong>Supervisor</strong>).
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Catatan: Jika role di ERP baru saja diubah, Anda wajib <strong>Keluar / Logout</strong> terlebih dahulu lalu login ulang agar perubahan role tersinkronisasi.
        </p>
        {showLoginLink ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <LogoutButton
              label="Keluar / Login Ulang"
              className="!min-h-10 !rounded-sm !border-emerald-600 !bg-emerald-600 !px-4 !py-2 !text-sm !font-semibold !text-white hover:!bg-emerald-700"
            />
            <Link
              href="/login"
              className="inline-flex min-h-10 items-center justify-center rounded-sm border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
            >
              Halaman Login
            </Link>
          </div>
        ) : null}
      </section>
      {showRoleSelector ? <RoleSelector currentRole={role} /> : null}
    </AppShell>
  );
}
