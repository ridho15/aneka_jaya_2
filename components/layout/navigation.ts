import { can, type Permission, type Role } from "@/lib/auth/roles";

export type NavCategory =
  | "MENU UTAMA"
  | "OPERASIONAL & TRANSAKSI"
  | "INVENTORY GUDANG & TOKO"
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
  /** Permission alternatif: link tampil bila role punya salah satunya. */
  anyPermission?: Permission[];
  /** Sembunyikan dari sidebar untuk role tertentu (halaman tetap bisa dibuka lewat tombol). */
  hideForRoles?: Role[];
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
    hideForRoles: ["ADMIN"],
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
    hideForRoles: ["ADMIN"],
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
    anyPermission: ["tempo.view_due"],
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

  // INVENTORY GUDANG & TOKO
  {
    href: "/inventory",
    label: "Stok Gudang & Toko",
    icon: "▦",
    permission: "inventory.stock.view",
    category: "INVENTORY GUDANG & TOKO",
  },
  {
    href: "/inventory/permintaan-gudang",
    label: "Permintaan Barang Gudang",
    icon: "⇄",
    permission: "inventory.stock.view",
    category: "INVENTORY GUDANG & TOKO",
  },
  {
    href: "/inventory/mutasi",
    label: "Mutasi / Kartu Stok",
    icon: "⇅",
    permission: "inventory.movement.view",
    category: "INVENTORY GUDANG & TOKO",
  },
  {
    href: "/inventory/transfer",
    label: "Transfer Stok",
    icon: "⇄",
    permission: "inventory.transfer",
    category: "INVENTORY GUDANG & TOKO",
  },
  {
    href: "/inventory/barang-masuk",
    label: "Barang Masuk",
    icon: "⤓",
    permission: "inventory.receive",
    category: "INVENTORY GUDANG & TOKO",
  },
  {
    href: "/inventory/opname",
    label: "Stock Opname",
    icon: "☑",
    permission: "inventory.opname",
    category: "INVENTORY GUDANG & TOKO",
  },
  {
    href: "/inventory/import",
    label: "Import Opname Excel",
    icon: "⇪",
    permission: "inventory.import",
    category: "INVENTORY GUDANG & TOKO",
  },
  {
    href: "/inventory/adjustment",
    label: "Stock Adjustment",
    icon: "±",
    permission: "inventory.adjust",
    category: "INVENTORY GUDANG & TOKO",
  },
  {
    href: "/inventory/produk",
    label: "Master Barang",
    icon: "▤",
    permission: "inventory.master",
    category: "INVENTORY GUDANG & TOKO",
  },
  {
    href: "/inventory/kalkulator",
    label: "Kalkulator Modal",
    icon: "∑",
    permission: "inventory.master",
    category: "INVENTORY GUDANG & TOKO",
  },
  {
    href: "/inventory/lokasi",
    label: "Lokasi Stok",
    icon: "⌂",
    permission: "inventory.location",
    category: "INVENTORY GUDANG & TOKO",
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
    href: "/akuntansi/aset-tetap",
    label: "Aset Tetap",
    icon: "▣",
    permission: "accounting.view",
    category: "AKUNTANSI & BUKU BESAR",
  },
  {
    href: "/akuntansi/persediaan",
    label: "Persediaan & Kebijakan",
    icon: "◫",
    permission: "accounting.view",
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
    href: "/reports/consignment",
    label: "Laporan Consignment",
    icon: "◫",
    permission: "reports.view",
    ownerOnly: true,
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
  "INVENTORY GUDANG & TOKO",
  "PEMBELIAN & IMPOR VALAS",
  "AKUNTANSI & BUKU BESAR",
  "SDM & PERSONALIA",
  "PUSAT LAPORAN",
  "SISTEM & MONITORING",
];

export function visibleNavLinks(role: Role): NavLink[] {
  return NAV_LINKS.filter((link) => {
    if (link.ownerOnly && role !== "OWNER") return false;
    if (!can(role, link.permission) && !(link.anyPermission ?? []).some((p) => can(role, p))) return false;
    if (link.hideForRoles?.includes(role)) return false;
    return true;
  });
}

export function visibleNavGroups(role: Role): NavGroup[] {
  const links = NAV_LINKS.filter((link) => {
    if (link.ownerOnly && role !== "OWNER") return false;
    if (!can(role, link.permission) && !(link.anyPermission ?? []).some((p) => can(role, p))) return false;
    if (link.hideForRoles?.includes(role)) return false;
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

/**
 * Sidebar ringkas: satu menu per modul. Halaman di dalam modul tampil sebagai tab di atas
 * konten (SectionTabs), jadi semua halaman tetap bisa dicapai dalam 2 klik.
 */
export type NavSectionGroup = "Utama" | "Penjualan & Kas" | "Stok & Pembelian" | "Keuangan" | "Sistem";

export type NavSection = { id: string; label: string; group: NavSectionGroup; hrefs: string[]; home?: string; tabs?: Record<string, string> };

export const NAV_SECTIONS: NavSection[] = [
  { id: "dashboard", label: "Dashboard", group: "Utama", hrefs: ["/dashboard"] },
  { id: "penjualan", label: "Penjualan", group: "Penjualan & Kas", hrefs: ["/penjualan", "/penjualan/input", "/penjualan/draft", "/penjualan/retur"], home: "/penjualan",
    tabs: { "/penjualan": "Riwayat", "/penjualan/input": "Input Baru", "/penjualan/draft": "Draft", "/penjualan/retur": "Retur" } },
  { id: "do", label: "Delivery Order", group: "Penjualan & Kas", hrefs: ["/delivery-orders"] },
  { id: "tempo", label: "Tempo & Piutang", group: "Penjualan & Kas", hrefs: ["/tempo"] },
  { id: "pengeluaran", label: "Pengeluaran", group: "Penjualan & Kas", hrefs: ["/pengeluaran", "/pengeluaran/input"], home: "/pengeluaran",
    tabs: { "/pengeluaran": "Riwayat", "/pengeluaran/input": "Input Baru" } },
  { id: "stok", label: "Stok", group: "Stok & Pembelian", hrefs: ["/inventory", "/inventory/permintaan-gudang", "/inventory/mutasi", "/stok-barang/ai-forecast"], home: "/inventory",
    tabs: { "/inventory": "Stok Gudang & Toko", "/inventory/permintaan-gudang": "Permintaan Gudang", "/inventory/mutasi": "Kartu Stok", "/stok-barang/ai-forecast": "Prediksi Stok" } },
  { id: "input-stok", label: "Input Stok", group: "Stok & Pembelian", hrefs: ["/inventory/barang-masuk", "/inventory/transfer", "/inventory/opname", "/inventory/adjustment", "/inventory/import"] },
  { id: "master-barang", label: "Master Barang", group: "Stok & Pembelian", hrefs: ["/inventory/produk", "/inventory/lokasi"], tabs: { "/inventory/produk": "Barang" } },
  { id: "pembelian", label: "Pembelian", group: "Stok & Pembelian", hrefs: ["/pembelian/pesanan", "/pembelian/invoice", "/pembelian/pembayaran"],
    tabs: { "/pembelian/pesanan": "Pesanan (PO)", "/pembelian/invoice": "Tagihan & Landed Cost", "/pembelian/pembayaran": "Pembayaran" } },
  { id: "laporan", label: "Laporan", group: "Keuangan", hrefs: ["/reports", "/reports/income-statement", "/reports/balance-sheet", "/reports/finance", "/reports/customers", "/reports/products", "/reports/stocks", "/reports/consignment", "/reports/ai-finance", "/reports/cctv"], home: "/reports",
    tabs: { "/reports": "Harian", "/reports/income-statement": "Laba Rugi", "/reports/balance-sheet": "Neraca", "/reports/finance": "Finance", "/reports/customers": "Customer", "/reports/products": "Produk", "/reports/stocks": "Stok", "/reports/consignment": "Consignment", "/reports/ai-finance": "AI CFO", "/reports/cctv": "CCTV" } },
  { id: "akuntansi", label: "Akuntansi", group: "Keuangan", hrefs: ["/akuntansi/jurnal", "/akuntansi/buku-besar", "/akuntansi/neraca-saldo", "/akuntansi/kurs", "/akuntansi/coa", "/akuntansi/tutup-buku", "/akuntansi/rekonsiliasi", "/akuntansi/persediaan", "/akuntansi/aset-tetap"],
    tabs: { "/akuntansi/jurnal": "Jurnal", "/akuntansi/kurs": "Kurs Valas", "/akuntansi/coa": "Bagan Akun", "/akuntansi/persediaan": "Persediaan", "/akuntansi/aset-tetap": "Aset Tetap", "/akuntansi/rekonsiliasi": "Rekonsiliasi" } },
  { id: "sdm", label: "SDM", group: "Keuangan", hrefs: ["/sdm/karyawan", "/sdm/organisasi", "/sdm/gaji", "/sdm/kasbon", "/sdm/simpanan", "/sdm/uang-muka"],
    tabs: { "/sdm/karyawan": "Karyawan", "/sdm/organisasi": "Organisasi", "/sdm/gaji": "Gaji", "/sdm/kasbon": "Kasbon", "/sdm/simpanan": "Simpanan", "/sdm/uang-muka": "Uang Muka" } },
  { id: "sistem", label: "Sistem", group: "Sistem", hrefs: ["/settings", "/audit-trail", "/erp-sync", "/cctv-monitoring", "/panduan"],
    tabs: { "/cctv-monitoring": "Monitoring CCTV" } },
  { id: "kalkulator", label: "Kalkulator Modal", group: "Sistem", hrefs: ["/inventory/kalkulator"] },
];

const SECTION_GROUP_ORDER: NavSectionGroup[] = ["Utama", "Penjualan & Kas", "Stok & Pembelian", "Keuangan", "Sistem"];

export type VisibleNavSection = { id: string; label: string; href: string; links: NavLink[] };

/** Modul yang punya minimal satu halaman yang boleh dibuka role ini, dengan tab-tabnya. */
export function visibleNavSections(role: Role): { group: NavSectionGroup; sections: VisibleNavSection[] }[] {
  const allowed = new Map(visibleNavLinks(role).map((l) => [l.href, l]));
  const sections = NAV_SECTIONS.map((s) => {
    const links = s.hrefs.map((h) => allowed.get(h)).filter((l): l is NavLink => Boolean(l)).map((l) => ({ ...l, label: s.tabs?.[l.href] ?? l.label }));
    const href = s.home && allowed.has(s.home) ? s.home : links[0]?.href;
    return { ...s, href, links };
  }).filter((s) => s.links.length > 0 && s.href);
  return SECTION_GROUP_ORDER
    .map((group) => ({ group, sections: sections.filter((s) => s.group === group).map(({ id, label, href, links }) => ({ id, label, href: href!, links })) }))
    .filter((g) => g.sections.length > 0);
}

/** Link yang paling cocok dengan URL: sama persis, atau awalan terpanjang (mis. /penjualan/123 → /penjualan). */
export function matchNavHref(pathname: string, hrefs: string[]) {
  return hrefs
    .filter((h) => pathname === h || pathname.startsWith(`${h}/`))
    .sort((a, b) => b.length - a.length)[0];
}

export function activeNavSection(pathname: string, sections: VisibleNavSection[]) {
  const href = matchNavHref(pathname, sections.flatMap((s) => s.links.map((l) => l.href)));
  return { section: sections.find((s) => s.links.some((l) => l.href === href)), href };
}
