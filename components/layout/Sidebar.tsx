"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { roleLabel, type Role } from "@/lib/auth/roles";
import { APP_BRAND_INITIALS, APP_BRAND_NAME } from "@/lib/appBrand";
import { isNavLinkActive, visibleNavGroups } from "./navigation";

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const groups = visibleNavGroups(role);

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

        {/* Navigation Links Grouped */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {groups.map((group) => (
            <div key={group.category}>
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                {group.category}
              </p>
              <div className="space-y-0.5">
                {group.links.map((link) => {
                  const active = isNavLinkActive(pathname, link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`flex items-center gap-3 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                        active
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "text-neutral-600 hover:bg-emerald-50 hover:text-emerald-800"
                      }`}
                    >
                      <span className="grid h-4 w-4 place-items-center text-sm leading-none">
                        {link.icon}
                      </span>
                      <span>{link.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer info */}
        <div className="border-t border-neutral-100 px-6 py-4 text-[11px] text-neutral-400">
          Operasional harian • {roleLabel(role)}
        </div>
      </div>
    </aside>
  );
}
