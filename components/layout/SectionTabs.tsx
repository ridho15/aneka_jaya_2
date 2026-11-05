"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth/roles";
import { activeNavSection, visibleNavSections } from "./navigation";

/** Tab halaman di dalam modul yang sedang dibuka; tidak tampil untuk modul satu halaman. */
export function SectionTabs({ role }: { role: Role }) {
  const pathname = usePathname();
  const sections = visibleNavSections(role).flatMap((g) => g.sections);
  const { section, href: activeHref } = activeNavSection(pathname, sections);
  if (!section || section.links.length < 2) return null;
  return (
    <nav aria-label={`Halaman ${section.label}`} className="-mx-5 mb-6 overflow-x-auto border-b border-slate-200 px-5 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {section.links.map((link) => {
          const active = link.href === activeHref;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition ${
                  active ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
