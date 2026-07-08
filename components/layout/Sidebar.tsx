"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { roleLabel, type Role } from "@/lib/auth/roles";
import { APP_BRAND_INITIALS, APP_BRAND_NAME } from "@/lib/appBrand";
import { isNavLinkActive, visibleNavLinks } from "./navigation";

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const visibleLinks = visibleNavLinks(role);
  return <aside className="hidden shrink-0 border-neutral-200 bg-white lg:block lg:min-h-screen lg:w-64 lg:border-r"><div className="flex items-center gap-3 px-7 py-7"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-sm font-black tracking-tighter text-white shadow-sm">{APP_BRAND_INITIALS}</span><div><p className="text-sm font-bold text-neutral-900">{APP_BRAND_NAME}</p><p className="mt-0.5 text-[11px] text-neutral-500">{roleLabel(role)}</p></div></div><nav className="block px-3 pb-3">{visibleLinks.map((link) => <Link key={link.href} href={link.href} className={`mb-1 flex items-center gap-3 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition ${isNavLinkActive(pathname, link.href) ? "bg-emerald-600 text-white shadow-sm" : "text-neutral-600 hover:bg-emerald-50 hover:text-emerald-800"}`}><span className="grid h-4 w-4 place-items-center text-base leading-none">{link.icon}</span>{link.label}</Link>)}</nav><div className="hidden border-t border-neutral-200 px-7 pt-5 text-xs text-neutral-400 lg:absolute lg:bottom-7 lg:left-0 lg:right-0">Operasional harian • akses sesuai role</div></aside>;
}
