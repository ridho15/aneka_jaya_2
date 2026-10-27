import { can, type Permission, type Role } from "@/lib/auth/roles";

export type NavCategory =
  | "MENU UTAMA"
  | "OPERASIONAL & TRANSAKSI"
  | "PEMBELIAN & IMPOR VALAS"
  | "AKUNTANSI & BUKU BESAR"
  | "SDM & PERSONALIA"
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
    href: "/penjualan/retur",
    label: "Retur Penjualan",
    icon: "↩",
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

  // PEMBELIAN & IMPOR VALAS
  {
    href: "/pembelian/pesanan",
    label: "Pesanan Pembelian (PO)",
    icon: "⎘",
    permission: "purchasing.view",
    category: "PEMBELIAN & IMPOR VALAS",
  },
  {
    href: "/pembelian/invoice",
    label: "Tagihan & Landed Cost",
    icon: "⌸",
    permission: "purchasing.view",
    category: "PEMBELIAN & IMPOR VALAS",
  },
  {
    href: "/pembelian/pembayaran",
    label: "Pembayaran Valas",
    icon: "⌹",
    permission: "purchasing.view",
    category: "PEMBELIAN & IMPOR VALAS",
  },

  // AKUNTANSI & BUKU BESAR
  {
    href: "/akuntansi/kurs",
    label: "Kurs Valas Harian",
    icon: "⟠",
    permission: "accounting.view",
    category: "AKUNTANSI & BUKU BESAR",
  },
  {
    href: "/akuntansi/jurnal",
    label: "Jurnal Transaksi",
    icon: "▤",
    permission: "accounting.view",
    category: "AKUNTANSI & BUKU BESAR",
  },
  {
    href: "/akuntansi/buku-besar",
    label: "Buku Besar",
    icon: "▥",
    permission: "accounting.view",
    category: "AKUNTANSI & BUKU BESAR",
  },
  {
    href: "/akuntansi/neraca-saldo",
    label: "Neraca Saldo",
    icon: "▦",
    permission: "accounting.view",
    category: "AKUNTANSI & BUKU BESAR",
  },
  {
    href: "/akuntansi/coa",
    label: "Bagan Akun (COA)",
    icon: "◈",
    permission: "accounting.coa.manage",
    category: "AKUNTANSI & BUKU BESAR",
  },
  {
    href: "/akuntansi/tutup-buku",
    label: "Tutup Buku",
    icon: "◷",
    permission: "accounting.period.manage",
    category: "AKUNTANSI & BUKU BESAR",
  },
  {
    href: "/akuntansi/rekonsiliasi",
    label: "Rekonsiliasi & Audit",
    icon: "⚖",
    permission: "accounting.view",
    category: "AKUNTANSI & BUKU BESAR",
  },

  // SDM & PERSONALIA
  {
    href: "/sdm/karyawan",
    label: "Daftar Karyawan",
    icon: "◬",
    permission: "sdm.view",
    category: "SDM & PERSONALIA",
  },
  {
    href: "/sdm/organisasi",
    label: "Bagan Organisasi",
    icon: "⎇",
    permission: "sdm.view",
    category: "SDM & PERSONALIA",
  },
  {
    href: "/sdm/simpanan",
    label: "Simpanan Karyawan",
    icon: "◪",
    permission: "sdm.view",
    category: "SDM & PERSONALIA",
  },
  {
    href: "/sdm/kasbon",
    label: "Kasbon Karyawan",
    icon: "◨",
    permission: "sdm.view",
    category: "SDM & PERSONALIA",
  },
  {
    href: "/sdm/uang-muka",
    label: "Uang Muka Operasional",
    icon: "◩",
    permission: "sdm.view",
    category: "SDM & PERSONALIA",
  },
  {
    href: "/sdm/gaji",
    label: "Riwayat Gaji",
    icon: "◰",
    permission: "sdm.salary.view",
    category: "SDM & PERSONALIA",
  },

  // PUSAT LAPORAN
  {
    href: "/reports/income-statement",
    label: "Laba Rugi (P&L)",
    icon: "▲",
    permission: "reports.finance_view",
    category: "PUSAT LAPORAN",
  },
  {
    href: "/reports/balance-sheet",
    label: "Neraca Keuangan",
    icon: "⚖",
    permission: "reports.finance_view",
    category: "PUSAT LAPORAN",
  },
  {
    href: "/reports",
    label: "Laporan Harian",
    icon: "▤",
    permission: "reports.view",
    category: "PUSAT LAPORAN",
  },
  {
    href: "/reports/customers",
    label: "Laporan Customer",
    icon: "◪",
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
    icon: "◈",
    permission: "reports.finance_view",
    category: "PUSAT LAPORAN",
    ownerOnly: true,
  },
  {
    href: "/reports/cctv",
    label: "Laporan Pengawasan CCTV",
    icon: "▣",
    permission: "reports.view",
    category: "PUSAT LAPORAN",
  },

  // SISTEM & MONITORING
  {
    href: "/cctv-monitoring",
    label: "Monitoring CCTV",
    icon: "◉",
    permission: "audit.view",
    category: "SISTEM & MONITORING",
  },
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
  "AKUNTANSI & BUKU BESAR",
  "SDM & PERSONALIA",
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
    (href === "/akuntansi/jurnal" && pathname.startsWith("/akuntansi/jurnal")) ||
    (href === "/akuntansi/buku-besar" && pathname.startsWith("/akuntansi/buku-besar")) ||
    (href === "/akuntansi/neraca-saldo" && pathname.startsWith("/akuntansi/neraca-saldo")) ||
    (href === "/akuntansi/rekonsiliasi" && pathname.startsWith("/akuntansi/rekonsiliasi")) ||
    (href === "/akuntansi/coa" && pathname.startsWith("/akuntansi/coa")) ||
    (href === "/akuntansi/tutup-buku" && pathname.startsWith("/akuntansi/tutup-buku")) ||
    (href === "/sdm/karyawan" && pathname.startsWith("/sdm/karyawan")) ||
    (href === "/sdm/kasbon" && pathname.startsWith("/sdm/kasbon")) ||
    (href === "/sdm/uang-muka" && pathname.startsWith("/sdm/uang-muka")) ||
    (href === "/sdm/gaji" && pathname.startsWith("/sdm/gaji")) ||
    (href === "/settings" && pathname.startsWith("/settings")) ||
    (href === "/cctv-monitoring" && pathname.startsWith("/cctv-monitoring")) ||
    (href === "/reports/cctv" && pathname.startsWith("/reports/cctv")) ||
    (href === "/reports/customers" && pathname.startsWith("/reports/customers")) ||
    (href === "/reports/products" && pathname.startsWith("/reports/products")) ||
    (href === "/reports/stocks" && pathname.startsWith("/reports/stocks")) ||
    (href === "/reports/finance" && pathname.startsWith("/reports/finance")) ||
    (href === "/reports/ai-finance" && pathname.startsWith("/reports/ai-finance"))
  );
}
