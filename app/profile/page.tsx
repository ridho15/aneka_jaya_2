import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentUser } from "@/lib/auth/session";
import { roleLabel } from "@/lib/auth/roles";
import { getUserProfile } from "@/lib/users/profile";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (user.id === "unauthenticated") redirect("/login");
  const profile = await getUserProfile(user);

  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-neutral-500">Akun</p>
        <h2 className="aj-page-title text-3xl font-bold">Profil</h2>
        <p className="mt-2 text-sm text-slate-600">Identitas akun yang tersinkronisasi dari Anika ERP.</p>
      </div>
      <section className="aj-surface max-w-2xl overflow-hidden">
        <dl className="divide-y divide-neutral-200">
          <ProfileRow label="Nama" value={profile.name} />
          <ProfileRow label="Email" value={profile.email || "-"} />
          <ProfileRow label="Role aplikasi" value={roleLabel(profile.role)} />
          <ProfileRow label="ID eksternal" value={profile.id} />
          <ProfileRow label="Login terakhir" value={profile.lastLoginAt ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short" }).format(profile.lastLoginAt) : "-"} />
        </dl>
      </section>
    </AppShell>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 px-5 py-4 sm:grid-cols-[11rem_1fr] sm:px-6"><dt className="text-sm font-medium text-neutral-500">{label}</dt><dd className="break-words text-sm font-semibold text-neutral-900">{value}</dd></div>;
}
