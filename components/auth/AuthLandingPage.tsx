import Link from "next/link";
import { RoleSelector } from "@/components/settings/RoleSelector";
import { LoginForm } from "@/components/auth/LoginForm";
import { isDemoRoleSelectorEnabled } from "@/lib/auth/demoUi";
import { resolveAuthProvider } from "@/lib/auth/request";
import { roleLabel, type Role } from "@/lib/auth/roles";
import { ssoLoginUrl } from "@/lib/auth/login";

type IconName = "sales" | "tempo" | "approval" | "stock" | "report";

function ModuleIcon({ name }: { name: IconName }) {
  if (name === "sales") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path d="M7 8h10M7 12h10M7 16h6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M5 3.75h14A1.25 1.25 0 0 1 20.25 5v14A1.25 1.25 0 0 1 19 20.25H5A1.25 1.25 0 0 1 3.75 19V5A1.25 1.25 0 0 1 5 3.75Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === "tempo") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path d="M12 6v6l4 2" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M12 21.25a9.25 9.25 0 1 0-8.4-5.38" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M3 21v-5h5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === "approval") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path d="m7.5 12 3 3 6-7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="M12 21.25a9.25 9.25 0 1 0 0-18.5 9.25 9.25 0 0 0 0 18.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === "stock") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path d="M4 8.5 12 4l8 4.5-8 4.5L4 8.5Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M4 8.5v7L12 20l8-4.5v-7M12 13v7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path d="M5 19.25h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M7 16v-5M12 16V7M17 16v-8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M5 4.75h14v14.5H5z" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function AuthLandingPage({ currentRole }: { currentRole: Role }) {
  const provider = resolveAuthProvider();
  const showRoleSelector = isDemoRoleSelectorEnabled();
  const loginUrl = ssoLoginUrl();
  const isTrustedHeader = provider === "trusted_header";
  const isLocalCredentials = provider === "local_credentials";
  const ssoReady = isTrustedHeader && Boolean(loginUrl);
  const loginHref = loginUrl || "";
  const appMode = process.env.NEXT_PUBLIC_APP_MODE === "production" ? "Production" : "Development";
  const modules: Array<{ label: string; description: string; icon: IconName }> = [
    { label: "Penjualan", description: "Input transaksi dan cetak bukti penjualan.", icon: "sales" },
    { label: "Tempo", description: "Pantau piutang, pembayaran, dan sisa tagihan.", icon: "tempo" },
    { label: "Approval", description: "Validasi transaksi yang perlu persetujuan.", icon: "approval" },
    { label: "Stok", description: "Lihat barang, quantity, dan sinkronisasi ERP.", icon: "stock" },
    { label: "Laporan", description: "Ringkasan operasional dan finance.", icon: "report" }
  ];
  const statusItems = ["Internal Operations", "Role-based Access", "ERP-ready"];

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 px-5 py-6 text-slate-950 sm:px-8 lg:px-10">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col justify-center">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] lg:items-stretch">
          <div className="relative overflow-hidden rounded-[2rem] border border-emerald-100 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-8 lg:p-10">
            <div className="absolute right-0 top-0 h-40 w-40 -translate-y-1/2 translate-x-1/3 rounded-full bg-emerald-100 blur-3xl" aria-hidden="true" />
            <div className="relative">
              <div className="flex flex-wrap gap-2">
                {statusItems.map((item) => (
                  <span key={item} className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                    {item}
                  </span>
                ))}
              </div>

              <div className="mt-10 max-w-3xl">
                <p className="text-sm font-semibold text-emerald-700">Aneka Jaya</p>
                <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">Aneka Jaya Internal App</h1>
                <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                  Pusat kerja operasional untuk penjualan, tempo, approval, stok, dan laporan harian. Masuk sesuai peran untuk melanjutkan pekerjaan dengan data yang rapi dan terkontrol.
                </p>
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                {isLocalCredentials ? (
                  <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <LoginForm />
                  </div>
                ) : ssoReady ? (
                  <Link href={loginHref} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700">
                    Masuk ke Sistem
                  </Link>
                ) : isTrustedHeader ? (
                  <button type="button" disabled className="inline-flex min-h-12 cursor-not-allowed items-center justify-center rounded-xl bg-slate-200 px-5 py-3 text-sm font-bold text-slate-500">
                    Masuk ke Sistem belum tersedia
                  </button>
                ) : null}
                {showRoleSelector ? (
                  <a href="#development-role-selector" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700">
                    Pilih Role Development
                  </a>
                ) : null}
                <Link href="/no-access" className="inline-flex min-h-12 items-center justify-center rounded-xl px-3 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-emerald-800">
                  Lihat status akses
                </Link>
              </div>
              {isTrustedHeader && !loginUrl ? (
                <p className="mt-3 text-sm font-medium text-amber-700">SSO perusahaan belum dikonfigurasi. Hubungi operator sistem.</p>
              ) : null}

              <div className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {modules.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition hover:border-emerald-200 hover:bg-emerald-50/70">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                      <ModuleIcon name={item.icon} />
                    </div>
                    <h2 className="mt-4 text-sm font-bold text-slate-950">{item.label}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)] sm:p-7">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-600 text-lg font-black tracking-tighter text-white">AJ</span>
              <div>
                <p className="text-sm font-bold text-slate-950">Status Akses</p>
                <p className="mt-0.5 text-xs text-slate-500">Kontrol masuk aplikasi internal</p>
              </div>
            </div>

            <div className="mt-7 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Mode aplikasi</p>
                <div className="mt-3 flex items-center justify-between gap-4">
                  <p className="text-lg font-bold text-slate-950">{appMode}</p>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{roleLabel(currentRole)}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Akses masuk</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {isLocalCredentials ? "Masuk memakai email atau username yang dibuat Super Admin." : showRoleSelector ? "Gunakan role development untuk menguji alur kerja lokal." : "Gunakan akses perusahaan untuk masuk ke sistem."}
                </p>
              </div>

              {isLocalCredentials ? (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
                  <p className="font-bold">Login internal aktif</p>
                  <p className="mt-1 text-xs leading-5">Role dan permission mengikuti data user yang tersimpan di database.</p>
                </div>
              ) : isTrustedHeader && !loginUrl ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                  <p className="font-bold">Login belum tersedia</p>
                  <p className="mt-1 text-xs leading-5">Operator perlu mengisi <code className="font-semibold">AUTH_SSO_LOGIN_URL</code> sebelum user dapat masuk melalui SSO.</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
                  {ssoReady ? "Login SSO siap digunakan." : "Akses halaman kerja mengikuti role aktif yang tersimpan untuk pengguna."}
                </div>
              )}
            </div>

            <p className="mt-6 text-xs leading-5 text-slate-500">
              Jika akses belum sesuai, minta Super Admin memperbarui pengguna Anda di Settings Users.
            </p>
          </aside>
        </div>

        {showRoleSelector ? (
          <div id="development-role-selector">
            <RoleSelector currentRole={currentRole} />
          </div>
        ) : null}
      </section>
    </main>
  );
}
