import type { AuditLog } from "@/lib/audit/store";
import type { Expense } from "@/lib/types/expenses";
import type { Product } from "@/lib/types/product";
import type { Sale } from "@/lib/types/sales";
import type { TempoPayment, TempoPaymentReversal } from "@/lib/tempo/store";

export type MonthlyPerformance = {
  key: string;
  label: string;
  sales: number;
  cogs?: number;
  grossProfit?: number;
  expenses: number;
  nettProfit?: number;
  grossMarginPercent?: number;
  nettMarginPercent?: number;
};

export type CategorySummary = {
  label: string;
  value: number;
  percentage: number;
};

export type DashboardSalesMetrics = {
  paidSales: Sale[];
  salesThisMonth: Sale[];
  salesToday: Sale[];
  receivedThisMonth: Sale[];
  receivedToday: Sale[];
  totalThisMonth: number;
  totalToday: number;
  totalReceivedThisMonth: number;
  totalReceivedToday: number;
};

export type DashboardProductKpi = {
  value: string;
  change: string;
};

export type DashboardOperationalProfitSummary = {
  grossProfitPercent: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  todayRevenue: number;
  todayExpenses: number;
  grossProfit: number;
  nettProfit: number;
  monthlySalesCount: number;
  todaySalesCount: number;
};

export type DashboardSalesFilters = {
  from?: string;
  to?: string;
  paymentMethod?: string;
  rekening?: string;
};

export type PaymentBreakdownEntry = {
  label: string;
  value: number;
  percentage: number;
  rekeningId?: string;
  paymentMethod: "Cash" | "TF";
};

export type PaymentBreakdown = {
  total: number;
  cash: PaymentBreakdownEntry;
  transfers: PaymentBreakdownEntry[];
};

export type ProfitDetailItem = {
  productRef: string;
  quantity: number;
  unitPrice: number;
  costPrice: number | null;
  discount: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPercent: number;
  isRealCost: boolean;
};

export type ProfitDetailSale = {
  id: string;
  saleDate: string;
  transactionNumber?: string;
  customerName: string;
  paymentMethod: string;
  rekeningNameSnapshot?: string;
  tipeCode: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPercent: number;
  hasRealCost: boolean;
  items: ProfitDetailItem[];
};

export type ProfitDetailExpense = {
  id: string;
  expenseDate: string;
  category: string;
  vendorName: string;
  description: string;
  rekeningNameSnapshot?: string;
  amount: number;
  attachmentUrl?: string;
  notes?: string;
};

export type DashboardProfitDetails = {
  periodLabel: string;
  from?: string;
  to?: string;
  fallbackMarginPercent: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  effectiveMarginPercent: number;
  totalExpenses: number;
  nettProfit: number;
  realCostItemsCount: number;
  totalItemsCount: number;
  salesCount: number;
  expensesCount: number;
  sales: ProfitDetailSale[];
  expenses: ProfitDetailExpense[];
};

// ============================================================================
// 1. FUNGSI PEMBANTU PENANGGALAN & WAKTU
// ============================================================================

/** Mengubah tanggal menjadi format string bulan "YYYY-MM" */
function kunciBulan(nilai: string | Date): string | null {
  const tanggal = nilai instanceof Date ? nilai : new Date(nilai);
  if (Number.isNaN(tanggal.getTime())) return null;
  return `${tanggal.getFullYear()}-${String(tanggal.getMonth() + 1).padStart(2, "0")}`;
}

/** Menambahkan jumlah bulan ke tanggal tertentu */
function tambahBulan(tanggal: Date, jumlahBulan: number): Date {
  return new Date(tanggal.getFullYear(), tanggal.getMonth() + jumlahBulan, 1);
}

/** Mendapatkan tanggal hari pertama pada bulan tersebut */
function awalBulan(nilai: string | Date): Date | null {
  const kunci = kunciBulan(nilai);
  if (!kunci) return null;
  const [tahun, bulan] = kunci.split("-").map(Number);
  return new Date(tahun, bulan - 1, 1);
}

/** Membuat daftar bulan berurutan antara tanggal awal dan tanggal akhir */
function rentangBulan(awal: Date, akhir: Date): MonthlyPerformance[] {
  const daftarBulan: MonthlyPerformance[] = [];
  for (let kursor = new Date(awal.getFullYear(), awal.getMonth(), 1); kursor <= akhir; kursor = tambahBulan(kursor, 1)) {
    daftarBulan.push({
      key: kunciBulan(kursor) as string,
      label: new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "Asia/Jakarta" }).format(kursor),
      sales: 0,
      cogs: 0,
      grossProfit: 0,
      expenses: 0,
      nettProfit: 0,
      grossMarginPercent: 0,
      nettMarginPercent: 0
    });
  }
  return daftarBulan;
}

// ============================================================================
// 2. FORMAT RUPIAH DASHBOARD
// ============================================================================

/** Memformat angka menjadi format rupiah ringkas (contoh: "Rp 100.000" atau "Rp 42.030 jt") */
export function formatDashboardMoney(nilai: number): string {
  const nominal = Number.isFinite(nilai) ? nilai : 0;
  if (Math.abs(nominal) >= 1_000_000) {
    return `Rp ${Math.round(nominal / 1_000).toLocaleString("id-ID")} jt`;
  }
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nominal);
}

// ============================================================================
// 3. METRIK PENJUALAN DASHBOARD
// ============================================================================

export function buildDashboardSalesMetrics(
  daftarPenjualan: Sale[],
  kunciHariIni: string,
  kunciBulanIni: string
): DashboardSalesMetrics {
  const penjualanApproved = daftarPenjualan.filter((penjualan) => penjualan.approvalStatus === "approved");
  const penjualanBulanIni = penjualanApproved.filter((penjualan) => penjualan.saleDate?.startsWith(kunciBulanIni));
  const penjualanHariIni = penjualanApproved.filter((penjualan) => penjualan.saleDate === kunciHariIni);
  const pembayaranDiterimaBulanIni = penjualanBulanIni.filter((penjualan) => penjualan.paymentMethod === "Cash" || penjualan.paymentMethod === "TF");
  const pembayaranDiterimaHariIni = penjualanHariIni.filter((penjualan) => penjualan.paymentMethod === "Cash" || penjualan.paymentMethod === "TF");

  return {
    paidSales: penjualanApproved,
    salesThisMonth: penjualanBulanIni,
    salesToday: penjualanHariIni,
    receivedThisMonth: pembayaranDiterimaBulanIni,
    receivedToday: pembayaranDiterimaHariIni,
    totalThisMonth: penjualanBulanIni.reduce((total, penjualan) => total + (penjualan.total || 0), 0),
    totalToday: penjualanHariIni.reduce((total, penjualan) => total + (penjualan.total || 0), 0),
    totalReceivedThisMonth: pembayaranDiterimaBulanIni.reduce((total, penjualan) => total + (penjualan.total || 0), 0),
    totalReceivedToday: pembayaranDiterimaHariIni.reduce((total, penjualan) => total + (penjualan.total || 0), 0)
  };
}

// ============================================================================
// 4. PENENTUAN ENTITAS OPERASIONAL (NON-AJ)
// ============================================================================

function kodeTipe(baris: { tipeId?: string; tipeCodeSnapshot?: string }): string {
  return (baris.tipeCodeSnapshot || baris.tipeId || "").trim().toUpperCase();
}

/** Menentukan apakah transaksi adalah penjualan operasional SLM (bukan konsinyasi/internal AJ) */
function apakahPenjualanOperasional(baris: Pick<Sale, "tipeId" | "tipeCodeSnapshot" | "syncTarget">): boolean {
  return kodeTipe(baris) !== "AJ";
}

/** Menentukan apakah pengeluaran adalah pengeluaran operasional SLM (bukan AJ) */
function apakahPengeluaranOperasional(baris: Pick<Expense, "tipeId" | "tipeCodeSnapshot">): boolean {
  return kodeTipe(baris) !== "AJ";
}

// ============================================================================
// 5. PEMBUATAN PETA HARGA MODAL DARI MASTER PRODUK ERP
// ============================================================================

export const MINIMUM_REAL_COST_THRESHOLD = 1000;

/**
 * Menyusun Map harga modal (cost price) dari master produk ERP.
 * Diindeks berdasarkan ID, SKU/kode, dan nama produk agar pencarian cepat.
 * Harga modal <= 1.000 (misal placeholder Rp 500 atau 0) diabaikan dan dianggap belum memiliki modal riil.
 */
function buatPetaHargaModal(daftarProduk: Product[] = []): Map<string, number> {
  const petaHarga = new Map<string, number>();
  for (const produk of daftarProduk) {
    const hargaModal = Number(produk.costPrice);
    if (!Number.isFinite(hargaModal) || hargaModal <= MINIMUM_REAL_COST_THRESHOLD) continue;
    if (produk.id) petaHarga.set(produk.id.trim().toLowerCase(), hargaModal);
    if (produk.code) petaHarga.set(produk.code.trim().toLowerCase(), hargaModal);
    if (produk.name) petaHarga.set(produk.name.trim().toLowerCase(), hargaModal);
  }
  return petaHarga;
}

// ============================================================================
// 6. KALKULASI GROSS PROFIT PER NOTA PENJUALAN
// ============================================================================

/**
 * Menghitung gross profit untuk satu nota penjualan:
 * - Barang dengan harga modal riil (> Rp 1.000): Profit = Omset Item - (Qty * Modal Riil).
 * - Barang tanpa modal (atau modal <= Rp 1.000): Profit = Omset Item * Persentase Estimasi Fallback (misal 10%).
 * - Khusus transaksi sumber MJ (source = 'MJ'):
 *   MJ mengambil markup 10% dari harga dasar SLM (Omset SLM = Omset MJ / 1.10).
 *   Profit SLM dihitung dari Omset SLM dikurangi Modal Riil AJ, atau 10% dari Omset SLM jika modal belum ada.
 * - Sisa omset pembulatan nota: Profit = Sisa Omset Dasar * Persentase Estimasi Fallback.
 */
function hitungGrossProfitPenjualan(
  penjualan: Sale,
  persenEstimasiFallback: number,
  petaHargaModal: Map<string, number>
): number {
  const persen = Number.isFinite(persenEstimasiFallback) ? Math.min(100, Math.max(0, persenEstimasiFallback)) : 0;
  const totalOmsetNota = Number(penjualan.total) || 0;
  const isMj = penjualan.source === "MJ" || penjualan.createdByUserId === "integration:mj";

  // Jika nota tidak memiliki rincian item, hitung seluruh omset dengan persentase estimasi
  if (!Array.isArray(penjualan.items) || penjualan.items.length === 0) {
    const omsetDasarNota = isMj ? Math.round(totalOmsetNota / 1.10) : totalOmsetNota;
    return Math.round((omsetDasarNota * persen) / 100);
  }

  // Uraikan setiap item barang di dalam nota
  const daftarItemTerurai = penjualan.items.map((item) => {
    const jumlah = Number(item.quantity) || 0;
    const hargaSatuan = Number(item.unitPrice) || 0;
    const diskon = Number(item.discount) || 0;
    const omsetPerItem = Math.max(0, jumlah * hargaSatuan - diskon);

    // Prioritas 1: Cari modal dari input barang manual (hanya jika > Rp 1.000)
    let modalAktif: number | null = null;
    const modalManual = Number(item.manualProduct?.costPrice);
    if (Number.isFinite(modalManual) && modalManual > MINIMUM_REAL_COST_THRESHOLD) {
      modalAktif = modalManual;
    } else {
      // Prioritas 2: Cari modal dari master produk ERP berdasarkan ID atau SKU (hanya jika > Rp 1.000)
      const kunciIdProduk = item.productId ? item.productId.trim().toLowerCase() : "";
      const kunciRefProduk = item.productRef ? item.productRef.trim().toLowerCase() : "";
      if (kunciIdProduk && petaHargaModal.has(kunciIdProduk)) {
        modalAktif = petaHargaModal.get(kunciIdProduk)!;
      } else if (kunciRefProduk && petaHargaModal.has(kunciRefProduk)) {
        modalAktif = petaHargaModal.get(kunciRefProduk)!;
      }
    }

    return {
      jumlah,
      omsetPerItem,
      modalAktif: modalAktif !== null && modalAktif > MINIMUM_REAL_COST_THRESHOLD ? modalAktif : null
    };
  });

  // Jika sama sekali tidak ada item yang bermodal riil, gunakan estimasi fallback untuk seluruh nota
  const adaModalRiil = daftarItemTerurai.some((item) => item.modalAktif !== null);
  if (!adaModalRiil) {
    const omsetDasarNota = isMj ? Math.round(totalOmsetNota / 1.10) : totalOmsetNota;
    return Math.round((omsetDasarNota * persen) / 100);
  }

  let totalProfit = 0;
  let omsetTerhitung = 0;

  // Akumulasikan profit per item
  for (const item of daftarItemTerurai) {
    omsetTerhitung += item.omsetPerItem;
    // Khusus transaksi MJ: Omset dasar SLM = Omset Item / 1.10 (markup 10% adalah hak MJ)
    const omsetDasarItem = isMj ? Math.round(item.omsetPerItem / 1.10) : item.omsetPerItem;

    if (item.modalAktif !== null) {
      // Ada modal riil: Omset dasar dikurangi modal asli AJ
      const totalBiayaModalItem = item.jumlah * item.modalAktif;
      totalProfit += omsetDasarItem - totalBiayaModalItem;
    } else {
      // Tidak ada modal riil: Gunakan persentase estimasi fallback (misal 10%) dari omset dasar
      totalProfit += (omsetDasarItem * persen) / 100;
    }
  }

  // Jika ada sisa omset nota di luar item (misal pembulatan atau biaya nota tambahan)
  const omsetSisaTanpaItem = Math.max(0, totalOmsetNota - omsetTerhitung);
  if (omsetSisaTanpaItem > 0) {
    const sisaDasar = isMj ? Math.round(omsetSisaTanpaItem / 1.10) : omsetSisaTanpaItem;
    totalProfit += (sisaDasar * persen) / 100;
  }

  return Math.round(totalProfit);
}

// ============================================================================
// 7. RINGKASAN PROFIT OPERASIONAL DASHBOARD
// ============================================================================

export function buildOperationalProfitSummary(
  daftarPenjualan: Sale[],
  daftarPengeluaran: Expense[],
  kunciHariIni: string,
  kunciBulanIni: string,
  persenEstimasiFallback = 0,
  daftarProduk: Product[] = []
): DashboardOperationalProfitSummary {
  const persen = Number.isFinite(persenEstimasiFallback) ? Math.min(100, Math.max(0, persenEstimasiFallback)) : 0;
  const petaHargaModal = buatPetaHargaModal(daftarProduk);

  // Filter hanya transaksi operasional yang berstatus approved
  const penjualanOperasionalApproved = daftarPenjualan.filter((penjualan) => penjualan.approvalStatus === "approved" && apakahPenjualanOperasional(penjualan));
  const pengeluaranOperasionalApproved = daftarPengeluaran.filter((pengeluaran) => pengeluaran.approvalStatus === "approved" && apakahPengeluaranOperasional(pengeluaran));

  // Pisahkan transaksi bulan ini dan hari ini
  const penjualanBulanIni = penjualanOperasionalApproved.filter((penjualan) => penjualan.saleDate?.startsWith(kunciBulanIni));
  const penjualanHariIni = penjualanOperasionalApproved.filter((penjualan) => penjualan.saleDate === kunciHariIni);
  const pengeluaranBulanIni = pengeluaranOperasionalApproved.filter((pengeluaran) => pengeluaran.expenseDate?.startsWith(kunciBulanIni));
  const pengeluaranHariIni = pengeluaranOperasionalApproved.filter((pengeluaran) => pengeluaran.expenseDate === kunciHariIni);

  // Hitung total omset dan pengeluaran
  const omsetBulanIni = penjualanBulanIni.reduce((total, penjualan) => total + (Number(penjualan.total) || 0), 0);
  const omsetHariIni = penjualanHariIni.reduce((total, penjualan) => total + (Number(penjualan.total) || 0), 0);
  const totalPengeluaranBulanIni = pengeluaranBulanIni.reduce((total, pengeluaran) => total + (Number(pengeluaran.amount) || 0), 0);
  const totalPengeluaranHariIni = pengeluaranHariIni.reduce((total, pengeluaran) => total + (Number(pengeluaran.amount) || 0), 0);

  // Akumulasikan gross profit bulan ini
  const totalGrossProfit = penjualanBulanIni.reduce((total, penjualan) => total + hitungGrossProfitPenjualan(penjualan, persen, petaHargaModal), 0);

  return {
    grossProfitPercent: persen,
    monthlyRevenue: omsetBulanIni,
    monthlyExpenses: totalPengeluaranBulanIni,
    todayRevenue: omsetHariIni,
    todayExpenses: totalPengeluaranHariIni,
    grossProfit: totalGrossProfit,
    nettProfit: totalGrossProfit - totalPengeluaranBulanIni,
    monthlySalesCount: penjualanBulanIni.length,
    todaySalesCount: penjualanHariIni.length
  };
}

// ============================================================================
// 8. PEMBERITAHUAN SUMBER DATA & KPI PRODUK
// ============================================================================

export function dashboardDataSourceNotice(appMode = process.env.NEXT_PUBLIC_APP_MODE) {
  return appMode === "production" ? undefined : "Mode development: dashboard dapat membaca gabungan DB dan JSON lokal.";
}

export function productKpi(sukses: boolean, jumlahItem: number, pesanError?: string): DashboardProductKpi {
  if (!sukses) return { value: "Tidak tersedia", change: pesanError || "Produk ERP belum tersedia" };
  return { value: `${jumlahItem} item`, change: "Semua gudang terpantau" };
}

// ============================================================================
// 9. FILTER PENJUALAN DASHBOARD
// ============================================================================

export function filterDashboardSales(daftarPenjualan: Sale[], filter: DashboardSalesFilters): Sale[] {
  return daftarPenjualan.filter((penjualan) => {
    if (filter.from && penjualan.saleDate < filter.from) return false;
    if (filter.to && penjualan.saleDate > filter.to) return false;
    if (filter.paymentMethod && penjualan.paymentMethod !== filter.paymentMethod) return false;
    if (filter.rekening && (penjualan.rekeningId || penjualan.rekeningNameSnapshot || "") !== filter.rekening) return false;
    return true;
  });
}

// ============================================================================
// 10. PEMBAGIAN PEMBAYARAN (CASH & TRANSFER BANK)
// ============================================================================

function hitungPersentasePembayaran(nilai: number, total: number): number {
  return total > 0 ? (nilai / total) * 100 : 0;
}

export function buildPaymentBreakdown(
  daftarPenjualan: Sale[],
  labelRekening: Record<string, string> = {},
  pembayaranTempo: TempoPayment[] = [],
  reversalTempo: TempoPaymentReversal[] = []
): PaymentBreakdown {
  const penjualanLunas = daftarPenjualan.filter((penjualan) => penjualan.approvalStatus === "approved" && (penjualan.paymentMethod === "Cash" || penjualan.paymentMethod === "TF"));
  const petaPembayaranById = new Map(pembayaranTempo.map((pembayaran) => [pembayaran.id, pembayaran]));

  // Hitung pembatalan uang kas dari tempo
  const reversalTunai = reversalTempo
    .filter((reversal) => petaPembayaranById.get(reversal.tempoPaymentId)?.paymentMethod === "Cash")
    .reduce((total, reversal) => total + reversal.amount, 0);

  // Hitung total uang tunai masuk (penjualan cash + pelunasan tempo cash - reversal)
  const totalTunai = penjualanLunas
    .filter((penjualan) => penjualan.paymentMethod === "Cash")
    .reduce((total, penjualan) => total + (Number(penjualan.total) || 0), 0)
    + pembayaranTempo.filter((pembayaran) => pembayaran.paymentMethod === "Cash").reduce((total, pembayaran) => total + pembayaran.amountPaid, 0)
    - reversalTunai;

  // Kelompokkan transfer bank berdasarkan rekening tujuan
  const totalTransferPerRekening = new Map<string, { label: string; rekeningId?: string; value: number }>();

  for (const penjualan of penjualanLunas) {
    if (penjualan.paymentMethod !== "TF") continue;
    const label = (penjualan.rekeningId && labelRekening[penjualan.rekeningId]) || penjualan.rekeningNameSnapshot || penjualan.transferAccount || "TF tanpa rekening";
    const kunci = penjualan.rekeningId || penjualan.rekeningNameSnapshot || penjualan.transferAccount || label;
    const dataLama = totalTransferPerRekening.get(kunci);
    totalTransferPerRekening.set(kunci, {
      label,
      rekeningId: penjualan.rekeningId || penjualan.rekeningNameSnapshot || penjualan.transferAccount,
      value: (dataLama?.value || 0) + (Number(penjualan.total) || 0)
    });
  }

  for (const pembayaran of pembayaranTempo) {
    if (pembayaran.paymentMethod !== "TF") continue;
    const label = labelRekening[pembayaran.rekeningId] || pembayaran.rekeningNameSnapshot || "TF tanpa rekening";
    const kunci = pembayaran.rekeningId || label;
    const dataLama = totalTransferPerRekening.get(kunci);
    totalTransferPerRekening.set(kunci, { label, rekeningId: pembayaran.rekeningId, value: (dataLama?.value || 0) + pembayaran.amountPaid });
  }

  for (const reversal of reversalTempo) {
    const pembayaran = petaPembayaranById.get(reversal.tempoPaymentId);
    if (!pembayaran || pembayaran.paymentMethod !== "TF") continue;
    const label = labelRekening[pembayaran.rekeningId] || pembayaran.rekeningNameSnapshot || "TF tanpa rekening";
    const kunci = pembayaran.rekeningId || label;
    const dataLama = totalTransferPerRekening.get(kunci);
    totalTransferPerRekening.set(kunci, { label, rekeningId: pembayaran.rekeningId, value: (dataLama?.value || 0) - reversal.amount });
  }

  const totalPembayaranSemua = totalTunai + Array.from(totalTransferPerRekening.values()).reduce((total, baris) => total + baris.value, 0);

  return {
    total: totalPembayaranSemua,
    cash: {
      label: "Cash",
      value: totalTunai,
      percentage: hitungPersentasePembayaran(totalTunai, totalPembayaranSemua),
      rekeningId: "cash",
      paymentMethod: "Cash"
    },
    transfers: Array.from(totalTransferPerRekening.values())
      .map((baris) => ({
        label: baris.label,
        value: baris.value,
        percentage: hitungPersentasePembayaran(baris.value, totalPembayaranSemua),
        rekeningId: baris.rekeningId,
        paymentMethod: "TF" as const
      }))
      .sort((a, b) => b.value - a.value)
  };
}

// ============================================================================
// 11. PERFORMA TREN BULANAN (GRAFIK & TABEL 6 BULAN)
// ============================================================================

export function buildMonthlyPerformance(
  daftarPenjualan: Sale[],
  daftarPengeluaran: Expense[],
  sekarang = new Date(),
  rentangFilter: { from?: string; to?: string } = {},
  persenEstimasiFallback = 0,
  daftarProduk: Product[] = []
): MonthlyPerformance[] {
  const akhirRentang = rentangFilter.to ? awalBulan(rentangFilter.to) : new Date(sekarang.getFullYear(), sekarang.getMonth(), 1);
  const awalRentang = rentangFilter.from ? awalBulan(rentangFilter.from) : akhirRentang ? tambahBulan(akhirRentang, -5) : new Date(sekarang.getFullYear(), sekarang.getMonth() - 5, 1);
  const daftarBulan = awalRentang && akhirRentang && awalRentang <= akhirRentang
    ? rentangBulan(awalRentang, akhirRentang)
    : rentangBulan(new Date(sekarang.getFullYear(), sekarang.getMonth() - 5, 1), new Date(sekarang.getFullYear(), sekarang.getMonth(), 1));

  const petaBulan = new Map(daftarBulan.map((bulan) => [bulan.key, bulan]));
  const persen = Number.isFinite(persenEstimasiFallback) ? Math.min(100, Math.max(0, persenEstimasiFallback)) : 0;
  const petaHargaModal = buatPetaHargaModal(daftarProduk);

  // Akumulasikan penjualan per bulan
  for (const penjualan of daftarPenjualan) {
    if (penjualan.approvalStatus !== "approved") continue;
    const bulan = petaBulan.get(kunciBulan(penjualan.saleDate) || "");
    if (bulan) {
      const omsetNota = Number(penjualan.total) || 0;
      const grossNota = hitungGrossProfitPenjualan(penjualan, persen, petaHargaModal);
      const hppNota = Math.max(0, omsetNota - grossNota);
      bulan.sales += omsetNota;
      bulan.grossProfit = (bulan.grossProfit || 0) + grossNota;
      bulan.cogs = (bulan.cogs || 0) + hppNota;
    }
  }

  // Akumulasikan pengeluaran per bulan
  for (const pengeluaran of daftarPengeluaran) {
    if (pengeluaran.approvalStatus !== "approved") continue;
    const nominal = Number(pengeluaran.amount);
    if (!Number.isFinite(nominal) || nominal <= 0) continue;
    const bulan = petaBulan.get(kunciBulan(pengeluaran.expenseDate) || "");
    if (bulan) bulan.expenses += nominal;
  }

  // Hitung margin dan profit bersih per bulan
  for (const bulan of daftarBulan) {
    const gross = bulan.grossProfit || 0;
    const beban = bulan.expenses || 0;
    bulan.nettProfit = gross - beban;
    bulan.grossMarginPercent = bulan.sales > 0 ? (gross / bulan.sales) * 100 : 0;
    bulan.nettMarginPercent = bulan.sales > 0 ? (bulan.nettProfit / bulan.sales) * 100 : 0;
  }

  return daftarBulan;
}

// ============================================================================
// 12. RINGKASAN KATEGORI PRODUK
// ============================================================================

export function buildCategorySummary(daftarPenjualan: Sale[], daftarProduk: Product[]): CategorySummary[] {
  const petaKategoriProduk = new Map<string, string>();
  for (const produk of daftarProduk) {
    for (const referensi of [produk.id, produk.code, produk.name]) {
      if (referensi) petaKategoriProduk.set(referensi.trim().toLowerCase(), produk.category || "Tanpa kategori");
    }
  }

  const totalPerKategori = new Map<string, number>();
  for (const penjualan of daftarPenjualan) {
    if (penjualan.approvalStatus !== "approved") continue;
    for (const item of penjualan.items) {
      const kategori = petaKategoriProduk.get(item.productRef.trim().toLowerCase()) || "Tanpa kategori";
      const omset = Math.max(0, item.quantity * item.unitPrice - (item.discount || 0));
      totalPerKategori.set(kategori, (totalPerKategori.get(kategori) || 0) + omset);
    }
  }

  const barisKategori = Array.from(totalPerKategori.entries());
  const totalSemuaKategori = barisKategori.reduce((total, [, nilai]) => total + nilai, 0);
  if (totalSemuaKategori <= 0) return [];
  return barisKategori
    .map(([label, nilai]) => ({ label, value: nilai, percentage: (nilai / totalSemuaKategori) * 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

// ============================================================================
// 13. LOG AKTIVITAS TERBARU
// ============================================================================

export function activityText(log: AuditLog) {
  const labelEntitas: Partial<Record<AuditLog["entityType"], string>> = {
    sales: "Penjualan",
    expense: "Pengeluaran",
    product: "Barang",
    approval: "Approval",
    tempo: "Tempo",
    whatsapp_report: "WhatsApp"
  };
  const entitas = labelEntitas[log.entityType] || log.entityType;
  return `${entitas} ${log.action.replaceAll("_", " ")} oleh ${log.userNameSnapshot}`;
}

export function activityStatusText(log: AuditLog) {
  if (log.action === "cancel") return "Dibatalkan";
  if (log.action === "reject") return "Ditolak";
  if (["create", "update", "mark_paid", "retry_sync"].includes(log.action)) return "Tercatat";
  return "Audit";
}

// ============================================================================
// 14. RINCIAN SUMBER DATA PROFITABILITAS (AUDIT DETIL)
// ============================================================================

export function buildDashboardProfitDetails(
  daftarPenjualan: Sale[],
  daftarPengeluaran: Expense[],
  options: {
    from?: string;
    to?: string;
    tipe?: string;
    fallbackMarginPercent?: number;
  } = {},
  daftarProduk: Product[] = []
): DashboardProfitDetails {
  const persen = Number.isFinite(options.fallbackMarginPercent)
    ? Math.min(100, Math.max(0, options.fallbackMarginPercent!))
    : 0;

  const petaHargaModal = buatPetaHargaModal(daftarProduk);

  // Filter penjualan operasional yang approved dan sesuai filter periode & tipe
  const operationalSales = daftarPenjualan.filter((s) => {
    if (s.approvalStatus !== "approved") return false;
    if (!apakahPenjualanOperasional(s)) return false;
    if (options.from && s.saleDate < options.from) return false;
    if (options.to && s.saleDate > options.to) return false;
    if (options.tipe && kodeTipe(s) !== options.tipe.trim().toUpperCase()) return false;
    return true;
  });

  // Filter pengeluaran operasional yang approved dan sesuai filter periode & tipe
  const operationalExpenses = daftarPengeluaran.filter((e) => {
    if (e.approvalStatus !== "approved") return false;
    if (!apakahPengeluaranOperasional(e)) return false;
    if (options.from && e.expenseDate < options.from) return false;
    if (options.to && e.expenseDate > options.to) return false;
    if (options.tipe && kodeTipe(e) !== options.tipe.trim().toUpperCase()) return false;
    return true;
  });

  let totalRevenue = 0;
  let totalCost = 0;
  let totalGrossProfit = 0;
  let realCostItemsCount = 0;
  let totalItemsCount = 0;

  const detailSales: ProfitDetailSale[] = [];

  for (const sale of operationalSales) {
    const saleTotal = Number(sale.total) || 0;
    const isMj = sale.source === "MJ" || sale.createdByUserId === "integration:mj";
    const items: ProfitDetailItem[] = [];

    let saleRevenue = 0;
    let saleCost = 0;
    let saleGrossProfit = 0;
    let saleRealCostItems = 0;

    for (const it of sale.items || []) {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.unitPrice) || 0;
      const disc = Number(it.discount) || 0;
      const itemRawOmset = Math.max(0, qty * price - disc);
      // Jika MJ, omset dasar = itemRawOmset / 1.10
      const itemRevenue = isMj ? Math.round(itemRawOmset / 1.10) : itemRawOmset;

      // Cari modal riil
      let modalAktif: number | null = null;
      const modalManual = Number(it.manualProduct?.costPrice);
      if (Number.isFinite(modalManual) && modalManual > MINIMUM_REAL_COST_THRESHOLD) {
        modalAktif = modalManual;
      } else {
        const kunciId = it.productId ? it.productId.trim().toLowerCase() : "";
        const kunciRef = it.productRef ? it.productRef.trim().toLowerCase() : "";
        if (kunciId && petaHargaModal.has(kunciId)) {
          modalAktif = petaHargaModal.get(kunciId)!;
        } else if (kunciRef && petaHargaModal.has(kunciRef)) {
          modalAktif = petaHargaModal.get(kunciRef)!;
        }
      }

      const isReal = modalAktif !== null && modalAktif > MINIMUM_REAL_COST_THRESHOLD;
      let itemCost = 0;
      let itemGross = 0;

      if (isReal) {
        itemCost = qty * modalAktif!;
        itemGross = itemRevenue - itemCost;
        saleRealCostItems++;
      } else {
        itemGross = Math.round((itemRevenue * persen) / 100);
        itemCost = Math.max(0, itemRevenue - itemGross);
      }

      const itemMargin = itemRevenue > 0 ? Number(((itemGross / itemRevenue) * 100).toFixed(1)) : 0;

      items.push({
        productRef: it.productRef,
        quantity: qty,
        unitPrice: price,
        costPrice: isReal ? modalAktif : null,
        discount: disc,
        revenue: itemRevenue,
        cost: itemCost,
        grossProfit: itemGross,
        marginPercent: itemMargin,
        isRealCost: isReal,
      });

      saleRevenue += itemRevenue;
      saleCost += itemCost;
      saleGrossProfit += itemGross;
      totalItemsCount++;
    }

    realCostItemsCount += saleRealCostItems;

    // Sisa omset pembulatan atau jika tidak ada item
    let finalSaleRevenue = saleRevenue;
    let finalSaleGrossProfit = saleGrossProfit;
    let finalSaleCost = saleCost;

    const baseSaleTotal = isMj ? Math.round(saleTotal / 1.10) : saleTotal;
    if (items.length === 0 || saleRevenue === 0) {
      finalSaleRevenue = baseSaleTotal;
      finalSaleGrossProfit = Math.round((baseSaleTotal * persen) / 100);
      finalSaleCost = Math.max(0, finalSaleRevenue - finalSaleGrossProfit);
    } else if (baseSaleTotal > saleRevenue) {
      const extra = baseSaleTotal - saleRevenue;
      const extraGross = Math.round((extra * persen) / 100);
      const extraCost = Math.max(0, extra - extraGross);
      finalSaleRevenue += extra;
      finalSaleGrossProfit += extraGross;
      finalSaleCost += extraCost;
    }

    const saleMargin = finalSaleRevenue > 0 ? Number(((finalSaleGrossProfit / finalSaleRevenue) * 100).toFixed(1)) : 0;

    totalRevenue += finalSaleRevenue;
    totalCost += finalSaleCost;
    totalGrossProfit += finalSaleGrossProfit;

    detailSales.push({
      id: sale.id,
      saleDate: sale.saleDate,
      transactionNumber: sale.transactionNumber,
      customerName: sale.customerName,
      paymentMethod: sale.paymentMethod,
      rekeningNameSnapshot: sale.rekeningNameSnapshot,
      tipeCode: kodeTipe(sale),
      revenue: finalSaleRevenue,
      cost: finalSaleCost,
      grossProfit: finalSaleGrossProfit,
      marginPercent: saleMargin,
      hasRealCost: saleRealCostItems > 0,
      items,
    });
  }

  const detailExpenses: ProfitDetailExpense[] = [];
  let totalExpenses = 0;

  for (const exp of operationalExpenses) {
    const amt = Number(exp.amount) || 0;
    totalExpenses += amt;
    detailExpenses.push({
      id: exp.id,
      expenseDate: exp.expenseDate,
      category: exp.category,
      vendorName: exp.vendorName,
      description: exp.description,
      rekeningNameSnapshot: exp.rekeningNameSnapshot || undefined,
      amount: amt,
      attachmentUrl: exp.attachmentUrl,
      notes: exp.notes,
    });
  }

  const effectiveMargin = totalRevenue > 0 ? Number(((totalGrossProfit / totalRevenue) * 100).toFixed(2)) : persen;
  const nettProfit = totalGrossProfit - totalExpenses;

  const periodLabel = options.from && options.to
    ? `${options.from} s/d ${options.to}`
    : options.from
      ? `Mulai ${options.from}`
      : "Bulan Berjalan";

  return {
    periodLabel,
    from: options.from,
    to: options.to,
    fallbackMarginPercent: persen,
    totalRevenue,
    totalCost,
    grossProfit: totalGrossProfit,
    effectiveMarginPercent: effectiveMargin,
    totalExpenses,
    nettProfit,
    realCostItemsCount,
    totalItemsCount,
    salesCount: detailSales.length,
    expensesCount: detailExpenses.length,
    sales: detailSales.sort((a, b) => b.saleDate.localeCompare(a.saleDate)),
    expenses: detailExpenses.sort((a, b) => b.expenseDate.localeCompare(a.expenseDate)),
  };
}

// ============================================================================
// 15. ALIAS EKSPOR BAHASA INDONESIA (MEMPERMUDAH PEMAHAMAN)
// ============================================================================

export const buatRingkasanProfitOperasional = buildOperationalProfitSummary;
export const hitungGrossProfit = hitungGrossProfitPenjualan;
export const buatPerformaBulanan = buildMonthlyPerformance;
export const buatRincianPembayaran = buildPaymentBreakdown;
export const filterPenjualan = filterDashboardSales;
export const formatUang = formatDashboardMoney;
