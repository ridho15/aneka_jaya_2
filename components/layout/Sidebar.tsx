"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { roleLabel, type Role } from "@/lib/auth/roles";
import { APP_BRAND_INITIALS, APP_BRAND_NAME } from "@/lib/appBrand";
import { activeNavSection, visibleNavSections } from "./navigation";
import { NavCountBadge } from "./NavCountBadge";
import type { NavBadges } from "@/lib/layout/navBadges";

export function Sidebar({ role, badges = {} }: { role: Role; badges?: NavBadges }) {
  const pathname = usePathname();
  const groups = visibleNavSections(role);
  const current = activeNavSection(pathname, groups.flatMap((g) => g.sections)).section;

  return (
    <aside className="hidden shrink-0 border-neutral-200 bg-white lg:sticky lg:top-0 lg:block lg:h-screen lg:w-64 lg:border-r lg:overflow-hidden">
      <div className="flex h-full flex-col">
        {/* Brand Header */}
        <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-6">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-sm font-black tracking-tighter text-white shadow-sm">
            {APP_BRAND_INITIALS}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-neutral-900">{APP_BRAND_NAME}</p>
            <p className="truncate text-[11px] text-neutral-500">{roleLabel(role)}</p>
          </div>
        </div>

        <nav aria-label="Menu utama" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {groups.map((group) => (
            <div key={group.group}>
              <p className="mb-1.5 px-3 text-xs font-semibold text-neutral-500">{group.group}</p>
              <div className="space-y-0.5">
                {group.sections.map((section) => {
                  const active = section.id === current?.id;
                  return (
                    <Link
                      key={section.id}
                      href={section.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-10 items-center rounded-xl px-3.5 text-sm font-semibold transition ${
                        active ? "bg-emerald-700 text-white" : "text-neutral-700 hover:bg-emerald-50 hover:text-emerald-800"
                      }`}
                    >
                      <span>{section.label}</span>
                      <NavCountBadge badge={badges[section.id]} active={active} />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer info */}
        <div className="border-t border-neutral-100 px-6 py-4 text-[11px] text-neutral-500">
          Login sebagai {roleLabel(role)}
        </div>
      </div>
    </aside>
  );
}
