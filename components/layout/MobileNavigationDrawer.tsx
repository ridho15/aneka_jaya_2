"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { roleLabel, type Role } from "@/lib/auth/roles";
import { APP_BRAND_INITIALS, APP_BRAND_NAME } from "@/lib/appBrand";
import { isNavLinkActive, visibleNavLinks } from "./navigation";

export function MobileNavigationDrawer({ role, userName }: { role: Role; userName: string }) {
  const pathname = usePathname();
  const [drawerState, setDrawerState] = useState({ open: false, pathname });
  const open = drawerState.open && drawerState.pathname === pathname;
  const visibleLinks = visibleNavLinks(role);
  const setOpen = (nextOpen: boolean) => setDrawerState({ open: nextOpen, pathname });

  return (
    <div className="lg:hidden">
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-sm font-black tracking-tighter text-white shadow-sm">{APP_BRAND_INITIALS}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-neutral-900">{APP_BRAND_NAME}</p>
            <p className="truncate text-[11px] text-neutral-500">{roleLabel(role)} • {userName}</p>
          </div>
        </div>
        <button type="button" aria-label="Buka menu" aria-controls="mobile-navigation-drawer" aria-expanded={open} onClick={() => setOpen(true)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-neutral-300 bg-white text-neutral-800 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800">
          <span aria-hidden="true" className="space-y-1.5">
            <span className="block h-0.5 w-5 bg-current" />
            <span className="block h-0.5 w-5 bg-current" />
            <span className="block h-0.5 w-5 bg-current" />
          </span>
        </button>
      </div>
      {open ? <div className="fixed inset-0 z-50 lg:hidden">
        <button type="button" aria-label="Tutup overlay menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-neutral-950/35" />
        <aside id="mobile-navigation-drawer" aria-label="Menu navigasi" className="absolute bottom-0 left-0 top-0 flex w-[min(84vw,20rem)] flex-col border-r border-neutral-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-sm font-black tracking-tighter text-white">{APP_BRAND_INITIALS}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-neutral-900">{APP_BRAND_NAME}</p>
                <p className="truncate text-[11px] text-neutral-500">{roleLabel(role)}</p>
              </div>
            </div>
            <button type="button" aria-label="Tutup menu" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-sm border border-neutral-300 text-xl leading-none text-neutral-700 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800">
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            {visibleLinks.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${isNavLinkActive(pathname, link.href) ? "bg-emerald-600 text-white shadow-sm" : "text-neutral-700 hover:bg-emerald-50 hover:text-emerald-800"}`}><span className="grid h-5 w-5 place-items-center text-base leading-none">{link.icon}</span><span>{link.label}</span></Link>)}
          </nav>
          <div className="border-t border-neutral-200 px-5 py-4 text-xs text-neutral-400">Operasional harian • akses sesuai role</div>
        </aside>
      </div> : null}
    </div>
  );
}
