import { can, type Permission, type Role } from "@/lib/auth/roles";

export type NavCategory =
  | "MENU UTAMA"
  | "OPERASIONAL & TRANSAKSI"
  | "PUSAT LAPORAN"
  | "SISTEM & MONITORING";

export type NavLink = {
  href: string;
  label: string;
  icon: string;
  permission: Permission;
  category: NavCategory;
  /** Sembunyikan dari sidebar jika role adalah OWNER (karena sudah terintegrasi di halaman riwayat) */
  hideForOwner?: boolean;
  /** Tampilkan hanya jika role adalah OWNER */
  ownerOnly?: boolean;
};

export type NavGroup = {
  category: NavCategory;
  links: NavLink[];
};

export const NAV_LINKS: NavLink[] = [
  // MENU UTAMA
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "⌂",
    permission: "dashboard.view",
    category: "MENU UTAMA",
  },

  // OPERASIONAL & TRANSAKSI
  {
    href: "/penjualan/input",
    label: "Input Penjualan",
    icon: "⌁",
    permission: "penjualan.create",
    category: "OPERASIONAL & TRANSAKSI",
    hideForOwner: true,
  },
  {
    href: "/penjualan",
    label: "Riwayat Penjualan",
    icon: "↗",
    permission: "penjualan.create",
    category: "OPERASIONAL & TRANSAKSI",
  },
  {
    href: "/penjualan/draft",
    label: "Draft Penjualan",
    icon: "✎",
    permission: "penjualan.create",
    category: "OPERASIONAL & TRANSAKSI",
  },
  {
    href: "/delivery-orders",
    label: "Delivery Order (DO)",
    icon: "⛟",
    permission: "do.view",
    category: "OPERASIONAL & TRANSAKSI",
  },
  {
    href: "/pengeluaran/input",
    label: "Input Pengeluaran",
    icon: "▣",
    permission: "pengeluaran.create",
    category: "OPERASIONAL & TRANSAKSI",
    hideForOwner: true,
  },
  {
    href: "/pengeluaran",
    label: "Riwayat Pengeluaran",
    icon: "−",
    permission: "pengeluaran.view",
    category: "OPERASIONAL & TRANSAKSI",
  },
  {
    href: "/barang",
    label: "Stock Barang",
    icon: "◇",
    permission: "stock.view",
    category: "OPERASIONAL & TRANSAKSI",
  },
  {
    href: "/stok-barang/ai-forecast",
    label: "AI Prediksi Stok",
    icon: "◈",
    permission: "stock.view",
    category: "OPERASIONAL & TRANSAKSI",
    ownerOnly: true,
  },
  {
    href: "/tempo",
    label: "Tempo & Piutang",
    icon: "◷",
    permission: "tempo.view",
    category: "OPERASIONAL & TRANSAKSI",
  },
  {
    href: "/approval",
    label: "Approval",
    icon: "✓",
    permission: "approval.view",
    category: "OPERASIONAL & TRANSAKSI",
  },

  // PUSAT LAPORAN
  {
    href: "/reports",
    label: "Laporan Harian",
    icon: "▤",
    permission: "reports.view",
    category: "PUSAT LAPORAN",
  },
  {
    href: "/reports/products",
    label: "Laporan Produk",
    icon: "▥",
    permission: "reports.view",
    category: "PUSAT LAPORAN",
  },
  {
    href: "/reports/stocks",
    label: "Laporan Stok",
    icon: "▦",
    permission: "reports.view",
    category: "PUSAT LAPORAN",
  },
  {
    href: "/reports/finance",
    label: "Laporan Finance",
    icon: "◫",
    permission: "reports.finance_view",
    category: "PUSAT LAPORAN",
  },
  {
    href: "/reports/ai-finance",
    label: "AI Keuangan & CFO",
    icon: "✨",
    permission: "reports.finance_view",
    category: "PUSAT LAPORAN",
    ownerOnly: true,
  },

  // SISTEM & MONITORING
  {
    href: "/erp-sync",
    label: "ERP Sync",
    icon: "↻",
    permission: "erp_sync.retry",
    category: "SISTEM & MONITORING",
  },
  {
    href: "/audit-trail",
    label: "Audit Trail",
    icon: "◎",
    permission: "audit.view",
    category: "SISTEM & MONITORING",
  },
  {
    href: "/settings",
    label: "Pengaturan",
    icon: "⚙",
    permission: "settings.view",
    category: "SISTEM & MONITORING",
  },
  {
    href: "/panduan",
    label: "Panduan",
    icon: "?",
    permission: "guide.view",
    category: "SISTEM & MONITORING",
  },
];

const CATEGORY_ORDER: NavCategory[] = [
  "MENU UTAMA",
  "OPERASIONAL & TRANSAKSI",
  "PUSAT LAPORAN",
  "SISTEM & MONITORING",
];

export function visibleNavLinks(role: Role): NavLink[] {
  return NAV_LINKS.filter((link) => {
    if (link.ownerOnly && role !== "OWNER") return false;
    if (!can(role, link.permission)) return false;
    return true;
  });
}

export function visibleNavGroups(role: Role): NavGroup[] {
  const links = NAV_LINKS.filter((link) => {
    if (link.ownerOnly && role !== "OWNER") return false;
    if (!can(role, link.permission)) return false;
    if (role === "OWNER" && link.hideForOwner) return false;
    return true;
  });

  const groups: NavGroup[] = [];

  for (const cat of CATEGORY_ORDER) {
    const categoryLinks = links.filter((l) => l.category === cat);
    if (categoryLinks.length > 0) {
      groups.push({
        category: cat,
        links: categoryLinks,
      });
    }
  }

  return groups;
}

export function isNavLinkActive(pathname: string, href: string) {
  return (
    pathname === href ||
    (href === "/barang" && pathname.startsWith("/barang")) ||
    (href === "/tempo" && pathname.startsWith("/tempo")) ||
    (href === "/settings" && pathname.startsWith("/settings")) ||
    (href === "/reports/products" && pathname.startsWith("/reports/products")) ||
    (href === "/reports/stocks" && pathname.startsWith("/reports/stocks")) ||
    (href === "/reports/finance" && pathname.startsWith("/reports/finance")) ||
    (href === "/reports/ai-finance" && pathname.startsWith("/reports/ai-finance"))
  );
}
