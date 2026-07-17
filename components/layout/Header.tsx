import { roleLabel } from "@/lib/auth/roles";
import Link from "next/link";
import { DemoLogoutButton } from "./DemoLogoutButton";
import { LogoutButton } from "./LogoutButton";
import type { UserProfile } from "@/lib/users/profile";
import { APP_BRAND_INITIALS, APP_BRAND_TITLE } from "@/lib/appBrand";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || APP_BRAND_INITIALS;
}

export function Header({ user, showDemoLogout = false, showLogout = false }: { user: UserProfile; showDemoLogout?: boolean; showLogout?: boolean }) {
  const date = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date());
  return (
    <header className="mb-8 flex flex-col gap-4 border-b border-neutral-300 pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-neutral-500">Operasional internal</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-neutral-900">{APP_BRAND_TITLE}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600 sm:justify-end">
        <span className="hidden border-r border-neutral-200 pr-4 sm:block">{date}</span>
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 border border-neutral-300 bg-white px-2.5 py-1.5 transition hover:border-emerald-400 hover:bg-emerald-50">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">{initials(user.name)}</span>
            <span className="text-left"><span className="block max-w-36 truncate font-semibold text-neutral-800">{user.name}</span><span className="block text-[10px] text-neutral-500">{roleLabel(user.role)}</span></span>
          </summary>
          <div className="absolute right-0 z-30 mt-2 w-64 border border-neutral-200 bg-white p-3 shadow-lg">
            <p className="truncate text-sm font-semibold text-neutral-900">{user.name}</p>
            {user.email && <p className="mt-0.5 truncate text-xs text-neutral-500">{user.email}</p>}
            <div className="mt-3 border-t border-neutral-100 pt-3">
              <Link href="/profile" className="block px-2 py-2 text-sm font-semibold text-neutral-700 hover:bg-emerald-50 hover:text-emerald-800">Profil</Link>
              {showLogout ? <LogoutButton className="mt-1 w-full justify-start border-0 px-2 py-2" /> : null}
              {showDemoLogout ? <DemoLogoutButton /> : null}
            </div>
          </div>
        </details>
        <span className="border border-neutral-300 bg-white px-2 py-1">{process.env.NEXT_PUBLIC_APP_MODE === "production" ? "Produksi" : "Development"}</span>
      </div>
    </header>
  );
}
