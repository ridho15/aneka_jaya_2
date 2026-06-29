import { AppShell } from "@/components/layout/AppShell";
import { RoleSelector } from "@/components/settings/RoleSelector";
import { isDemoRoleSelectorEnabled } from "@/lib/auth/demoUi";
import { resolveAuthProvider } from "@/lib/auth/request";
import { getCurrentRole } from "@/lib/auth/session";
import Link from "next/link";

export default async function NoAccessPage() {
  const role = await getCurrentRole();
  const showRoleSelector = isDemoRoleSelectorEnabled();
  const showLoginLink = !showRoleSelector && resolveAuthProvider() === "trusted_header";
  return (
    <AppShell>
      <section className="aj-surface max-w-xl p-8">
        <p className="text-xs font-bold uppercase tracking-[0.13em] text-red-600">No access</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight">Akses belum diberikan</h2>
        <p className="mt-3 text-sm text-slate-600">
          Role ini belum memiliki halaman yang boleh dibuka. {showRoleSelector ? "Untuk mode development, pilih role demo di bawah ini." : "Hubungi Super Admin untuk konfigurasi akses Viewer."}
        </p>
        {showLoginLink ? <Link href="/login" className="mt-5 inline-flex min-h-10 items-center justify-center rounded-sm bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700">Kembali ke login</Link> : null}
      </section>
      {showRoleSelector ? <RoleSelector currentRole={role} /> : null}
    </AppShell>
  );
}
