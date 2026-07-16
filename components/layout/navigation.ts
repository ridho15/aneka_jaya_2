import { can, type Permission, type Role } from "@/lib/auth/roles";

export type NavLink = { href: string; label: string; icon: string; permission: Permission };

export const NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: "⌂", permission: "dashboard.view" },
  { href: "/penjualan/input", label: "Input Penjualan", icon: "⌁", permission: "penjualan.create" },
  { href: "/penjualan", label: "Riwayat Penjualan", icon: "↗", permission: "penjualan.create" },
  { href: "/pengeluaran/input", label: "Input Pengeluaran", icon: "▣", permission: "pengeluaran.create" },
  { href: "/pengeluaran", label: "Riwayat Pengeluaran", icon: "−", permission: "pengeluaran.view" },
  { href: "/barang", label: "Stock Barang", icon: "◇", permission: "stock.view" },
  { href: "/reports", label: "Laporan", icon: "▤", permission: "reports.view" },
  { href: "/reports/finance", label: "Laporan Finance", icon: "◫", permission: "reports.finance_view" },
  { href: "/approval", label: "Approval", icon: "✓", permission: "approval.view" },
  { href: "/tempo", label: "Tempo", icon: "◷", permission: "tempo.view" },
  { href: "/erp-sync", label: "ERP Sync", icon: "↻", permission: "erp_sync.retry" },
  { href: "/audit-trail", label: "Audit Trail", icon: "◎", permission: "audit.view" },
  { href: "/panduan", label: "Panduan", icon: "?", permission: "guide.view" },
  { href: "/settings", label: "Pengaturan", icon: "⚙", permission: "settings.view" }
];

export function visibleNavLinks(role: Role) {
  return NAV_LINKS.filter((link) => can(role, link.permission));
}

export function isNavLinkActive(pathname: string, href: string) {
  return pathname === href || (href === "/barang" && pathname.startsWith("/barang")) || (href === "/tempo" && pathname.startsWith("/tempo")) || (href === "/settings" && pathname.startsWith("/settings"));
}
