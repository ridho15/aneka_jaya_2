"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { roleLabel, type Role } from "@/lib/auth/roles";
import { APP_BRAND_INITIALS, APP_BRAND_NAME } from "@/lib/appBrand";
import { activeNavSection, visibleNavSections } from "./navigation";
import { NavCountBadge } from "./NavCountBadge";
import type { NavBadges } from "@/lib/layout/navBadges";

export function MobileNavigationDrawer({ role, userName, badges = {} }: { role: Role; userName: string; badges?: NavBadges }) {
  const pathname = usePathname();
  const [drawerState, setDrawerState] = useState({ open: false, pathname });
  const open = drawerState.open && drawerState.pathname === pathname;
  const groups = visibleNavSections(role);
  const current = activeNavSection(pathname, groups.flatMap((g) => g.sections)).section;
  const pending = groups.flatMap((g) => g.sections).reduce((sum, s) => sum + (badges[s.id]?.count ?? 0), 0);
  const setOpen = (nextOpen: boolean) => setDrawerState({ open: nextOpen, pathname });

  return (
    <div className="lg:hidden">
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-sm font-black tracking-tighter text-white shadow-sm">{APP_BRAND_INITIALS}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-neutral-900">{APP_BRAND_NAME}</p>
            <p className="truncate text-xs text-neutral-500">{roleLabel(role)} · {userName}</p>
          </div>
        </div>
        <button type="button" aria-label="Buka menu" aria-controls="mobile-navigation-drawer" aria-expanded={open} onClick={() => setOpen(true)} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-800 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800">
          <span aria-hidden="true" className="space-y-1">
            <span className="block h-0.5 w-4 bg-current" />
            <span className="block h-0.5 w-4 bg-current" />
            <span className="block h-0.5 w-4 bg-current" />
          </span>
          Menu
          {pending > 0 && <NavCountBadge badge={{ count: pending, title: `${pending} hal perlu ditindaklanjuti` }} active={false} />}
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
            <button type="button" aria-label="Tutup menu" onClick={() => setOpen(false)} className="grid h-11 w-11 place-items-center rounded-sm border border-neutral-300 text-xl leading-none text-neutral-700 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800">
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <nav aria-label="Menu utama" className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
            {groups.map((group) => (
              <div key={group.group}>
                <p className="mb-1.5 px-3 text-xs font-semibold text-neutral-500">{group.group}</p>
                <div className="space-y-0.5">
                  {group.sections.map((section) => (
                    <Link
                      key={section.id}
                      href={section.href}
                      onClick={() => setOpen(false)}
                      aria-current={section.id === current?.id ? "page" : undefined}
                      className={`flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold transition ${
                        section.id === current?.id ? "bg-emerald-700 text-white" : "text-neutral-700 hover:bg-emerald-50 hover:text-emerald-800"
                      }`}
                    >
                      {section.label}
                      <NavCountBadge badge={badges[section.id]} active={section.id === current?.id} />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="border-t border-neutral-200 px-5 py-4 text-xs text-neutral-500">Menu sesuai hak akses {roleLabel(role)}</div>
        </aside>
      </div> : null}
    </div>
  );
}
