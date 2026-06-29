"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { can, roleLabel, type Permission, type Role } from "@/lib/auth/roles";
import { APP_BRAND_INITIALS, APP_BRAND_NAME } from "@/lib/appBrand";

type NavLink = { href: string; label: string; icon: string; permission: Permission };

const links: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: "⌂", permission: "dashboard.view" },
  { href: "/penjualan/input", label: "Input Penjualan", icon: "⌁", permission: "penjualan.create" },
  { href: "/pengeluaran/input", label: "Input Pengeluaran", icon: "▣", permission: "pengeluaran.create" },
  { href: "/barang", label: "Stock Barang", icon: "◇", permission: "stock.view" },
  { href: "/reports", label: "Laporan", icon: "▤", permission: "reports.view" },
  { href: "/reports/finance", label: "Laporan Finance", icon: "◫", permission: "reports.finance_view" },
  { href: "/approval", label: "Approval", icon: "✓", permission: "approval.view" },
  { href: "/tempo", label: "Tempo", icon: "◷", permission: "tempo.view" },
  { href: "/erp-sync", label: "ERP Sync", icon: "↻", permission: "erp_sync.retry" },
  { href: "/audit-trail", label: "Audit Trail", icon: "◎", permission: "audit.view" },
  { href: "/settings", label: "Pengaturan", icon: "⚙", permission: "settings.view" }
];

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const visibleLinks = links.filter((link) => can(role, link.permission));
  return <aside className="w-full shrink-0 border-b border-neutral-200 bg-white lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r"><div className="flex items-center gap-3 px-7 py-7"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-sm font-black tracking-tighter text-white shadow-sm">{APP_BRAND_INITIALS}</span><div><p className="text-sm font-bold text-neutral-900">{APP_BRAND_NAME}</p><p className="mt-0.5 text-[11px] text-neutral-500">{roleLabel(role)}</p></div></div><nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block">{visibleLinks.map((link) => <Link key={link.href} href={link.href} className={`flex items-center gap-3 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition lg:mb-1 ${pathname === link.href || (link.href === "/barang" && pathname.startsWith("/barang")) || (link.href === "/tempo" && pathname.startsWith("/tempo")) || (link.href === "/settings" && pathname.startsWith("/settings")) ? "bg-emerald-600 text-white shadow-sm" : "text-neutral-600 hover:bg-emerald-50 hover:text-emerald-800"}`}><span className="grid h-4 w-4 place-items-center text-base leading-none">{link.icon}</span>{link.label}</Link>)}</nav><div className="hidden border-t border-neutral-200 px-7 pt-5 text-xs text-neutral-400 lg:absolute lg:bottom-7 lg:left-0 lg:right-0">Operasional harian • akses sesuai role</div></aside>;
}
