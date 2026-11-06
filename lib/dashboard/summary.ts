import { isPaidPaymentMethod, salePaymentParts } from "@/lib/sales/payments";
import type { AuditLog } from "@/lib/audit/store";
import type { Expense } from "@/lib/types/expenses";
import { isProfitExpense } from "@/lib/expenses/coa";
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
  /** Laba = omset − modal. */
  grossProfit: number;
  /** Nett profit = laba − pengeluaran. */
  nettProfit: number;
  monthlyCogs: number;
  todayCogs: number;
  todayGrossProfit: number;
  todayNettProfit: number;
  /** Nota yang sebagian modalnya belum ada di Master Barang, jadi modalnya memakai estimasi GP. */
  monthlyEstimatedSalesCount: number;
  /** Ada nota MJ: omsetnya dihitung bagian SLM (nota ÷ 1,1). */
  hasMjSales: boolean;
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
  const pembayaranDiterimaBulanIni = penjualanBulanIni.filter((penjualan) => isPaidPaymentMethod(penjualan.paymentMethod));
  const pembayaranDiterimaHariIni = penjualanHariIni.filter((penjualan) => isPaidPaymentMethod(penjualan.paymentMethod));

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
function apakahPengeluaranOperasional(baris: Pick<Expense, "tipeId" | "tipeCodeSnapshot" | "categoryCode" | "amount">): boolean {
  return kodeTipe(baris) !== "AJ" && isProfitExpense(baris);
}

// ============================================================================
// 5. PEMBUATAN PETA HARGA MODAL DARI MASTER PRODUK ERP
// ============================================================================

export const MINIMUM_REAL_COST_THRESHOLD = 1000;

/**
 * Menyusun Map harga modal (cost price) dari Master Barang SLM.
 * Diindeks berdasarkan ID, SKU/kode, dan nama produk agar pencarian cepat.
 * Harga modal <= 1.000 (misal placeholder Rp 500 atau 0) diabaikan dan dianggap belum memiliki modal riil.
 */
function buatPetaHargaModal(daftarProduk: Product[] = []): Map<string, number> {
  const petaHarga = new Map<string, number>();
  for (const produk of daftarProduk) {
    const hargaModal = Number(produk.costPrice);
    if (!Number.isFinite(hargaModal) || hargaModal <= MINIMUM_REAL_COST_THRESHOLD) continue;
    if (produk.id) petaHarga.set(produk.id.trim().toLowerCase(), hargaModal);
    if (produk.productId) petaHarga.set(produk.productId.trim().toLowerCase(), hargaModal);
    if (produk.code) petaHarga.set(produk.code.trim().toLowerCase(), hargaModal);
    if (produk.name) petaHarga.set(produk.name.trim().toLowerCase(), hargaModal);
  }
  return petaHarga;
}

// ============================================================================
// 6. KALKULASI GROSS PROFIT PER NOTA PENJUALAN
// ============================================================================

/** Bagian nota MJ yang menjadi hak SLM: harga MJ sudah termasuk markup 10% milik MJ. */
const MJ_MARKUP = 1.1;
/** Modal di atas 2× harga jual per satuan dianggap salah input (biasanya beda satuan pcs/lusin). */
const MODAL_MAKS_KALI_HARGA = 2;

export type LabaItem = {
  productRef: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  omset: number;
  modal: number;
  laba: number;
  /** Modal per satuan dari Master Barang; null bila modalnya 0 / tidak masuk akal sehingga memakai estimasi GP. */
  modalPerSatuan: number | null;
};

export type LabaNota = { omset: number; modal: number; laba: number; itemEstimasi: number; items: LabaItem[] };

export function isTransaksiMj(penjualan: Pick<Sale, "source" | "createdByUserId">) {
  return penjualan.source === "MJ" || penjualan.createdByUserId === "integration:mj";
}

/** Modal per satuan yang masuk akal dari Master Barang (harga RMB × kurs + ongkir CBM + biaya lain), atau null. */
function modalWajar(item: NonNullable<Sale["items"]>[number], petaHargaModal: Map<string, number>, hargaBersihPerSatuan: number) {
  const manual = Number(item.manualProduct?.costPrice);
  const id = item.productId?.trim().toLowerCase() ?? "";
  const ref = item.productRef?.trim().toLowerCase() ?? "";
  const modal = Number.isFinite(manual) && manual > MINIMUM_REAL_COST_THRESHOLD
    ? manual
    : (id && petaHargaModal.get(id)) || (ref && petaHargaModal.get(ref)) || 0;
  if (!(modal > MINIMUM_REAL_COST_THRESHOLD)) return null;
  if (hargaBersihPerSatuan > 0 && modal > hargaBersihPerSatuan * MODAL_MAKS_KALI_HARGA) return null;
  return modal;
}

/**
 * Laba satu nota: Omset − Modal.
 * - Omset = nilai nota; untuk transaksi MJ hanya bagian SLM (nota ÷ 1,1).
 * - Modal per barang dari Master Barang. Bila 0, ≤ Rp 1.000, atau lebih dari 2× harga jual per satuan,
 *   modal = omset barang × (100% − GP%) sesuai pengaturan estimasi GP.
 * - Omset nota di luar rincian barang (mis. ongkir yang ditagihkan) memakai aturan GP yang sama.
 */
export function hitungLabaNota(penjualan: Sale, persenGp: number, petaHargaModal: Map<string, number>): LabaNota {
  const gp = Number.isFinite(persenGp) ? Math.min(100, Math.max(0, persenGp)) : 0;
  const bagianSlm = (n: number) => (isTransaksiMj(penjualan) ? Math.round(n / MJ_MARKUP) : n);
  const modalEstimasi = (omset: number) => Math.round(omset * (1 - gp / 100));
  const omsetNota = bagianSlm(Number(penjualan.total) || 0);

  const kotor = (penjualan.items ?? []).map((item) => bagianSlm(Math.max(0, (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) - (Number(item.discount) || 0))));
  const totalKotor = kotor.reduce((a, b) => a + b, 0);
  // Omset mengikuti total nota: bila rincian barang lebih besar (mis. diskon nota), dibagi proporsional.
  const skala = totalKotor > omsetNota && totalKotor > 0 ? omsetNota / totalKotor : 1;
  const items: LabaItem[] = (penjualan.items ?? []).map((item, index) => {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const discount = Number(item.discount) || 0;
    const omset = Math.round(kotor[index] * skala);
    const modalPerSatuan = quantity > 0 ? modalWajar(item, petaHargaModal, omset / quantity) : null;
    const modal = modalPerSatuan != null ? Math.round(quantity * modalPerSatuan) : modalEstimasi(omset);
    return { productRef: item.productRef, quantity, unitPrice, discount, omset, modal, laba: omset - modal, modalPerSatuan };
  });

  const omsetItem = items.reduce((s, i) => s + i.omset, 0);
  const sisa = Math.max(0, omsetNota - omsetItem);
  const modal = items.reduce((s, i) => s + i.modal, 0) + modalEstimasi(sisa);
  // Pembulatan pembagian proporsional tidak boleh membuat omset beda dari total nota.
  const omset = skala < 1 ? omsetNota : omsetItem + sisa;
  return { omset, modal, laba: omset - modal, itemEstimasi: items.filter((i) => i.modalPerSatuan == null).length + (sisa > 0 && !items.length ? 1 : 0), items };
}

function hitungGrossProfitPenjualan(penjualan: Sale, persenGp: number, petaHargaModal: Map<string, number>): number {
  return hitungLabaNota(penjualan, persenGp, petaHargaModal).laba;
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

  const total = (daftar: Sale[]) => daftar.reduce((acc, penjualan) => {
    const nota = hitungLabaNota(penjualan, persen, petaHargaModal);
    return { omset: acc.omset + nota.omset, modal: acc.modal + nota.modal, estimasi: acc.estimasi + (nota.itemEstimasi > 0 ? 1 : 0) };
  }, { omset: 0, modal: 0, estimasi: 0 });
  const bulan = total(penjualanBulanIni);
  const hari = total(penjualanHariIni);
  const pengeluaranBulan = pengeluaranBulanIni.reduce((acc, pengeluaran) => acc + (Number(pengeluaran.amount) || 0), 0);
  const pengeluaranHari = pengeluaranHariIni.reduce((acc, pengeluaran) => acc + (Number(pengeluaran.amount) || 0), 0);

  // Gross profit = omset − modal; nett profit = gross profit − pengeluaran.
  return {
    grossProfitPercent: persen,
    monthlyRevenue: bulan.omset,
    monthlyExpenses: pengeluaranBulan,
    todayRevenue: hari.omset,
    todayExpenses: pengeluaranHari,
    grossProfit: bulan.omset - bulan.modal,
    nettProfit: bulan.omset - bulan.modal - pengeluaranBulan,
    monthlyCogs: bulan.modal,
    todayCogs: hari.modal,
    todayGrossProfit: hari.omset - hari.modal,
    todayNettProfit: hari.omset - hari.modal - pengeluaranHari,
    monthlyEstimatedSalesCount: bulan.estimasi,
    hasMjSales: penjualanBulanIni.some(isTransaksiMj),
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
  const penjualanLunas = daftarPenjualan.filter((penjualan) => penjualan.approvalStatus === "approved" && isPaidPaymentMethod(penjualan.paymentMethod));
  const petaPembayaranById = new Map(pembayaranTempo.map((pembayaran) => [pembayaran.id, pembayaran]));

  // Hitung pembatalan uang kas dari tempo
  const reversalTunai = reversalTempo
    .filter((reversal) => petaPembayaranById.get(reversal.tempoPaymentId)?.paymentMethod === "Cash")
    .reduce((total, reversal) => total + reversal.amount, 0);

  // Split dipecah: bagian Cash ke tunai, bagian TF ke rekening tujuannya.
  const bagianPembayaran = penjualanLunas.flatMap((penjualan) => salePaymentParts(penjualan));

  // Hitung total uang tunai masuk (penjualan cash + pelunasan tempo cash - reversal)
  const totalTunai = bagianPembayaran
    .filter((bagian) => bagian.method === "Cash")
    .reduce((total, bagian) => total + bagian.amount, 0)
    + pembayaranTempo.filter((pembayaran) => pembayaran.paymentMethod === "Cash").reduce((total, pembayaran) => total + pembayaran.amountPaid, 0)
    - reversalTunai;

  // Kelompokkan transfer bank berdasarkan rekening tujuan
  const totalTransferPerRekening = new Map<string, { label: string; rekeningId?: string; value: number }>();

  for (const bagian of bagianPembayaran) {
    if (bagian.method !== "TF") continue;
    const label = (bagian.rekeningId && labelRekening[bagian.rekeningId]) || bagian.rekeningNameSnapshot || bagian.transferAccount || "TF tanpa rekening";
    const kunci = bagian.rekeningId || bagian.rekeningNameSnapshot || bagian.transferAccount || label;
    const dataLama = totalTransferPerRekening.get(kunci);
    totalTransferPerRekening.set(kunci, {
      label,
      rekeningId: bagian.rekeningId || bagian.rekeningNameSnapshot || bagian.transferAccount,
      value: (dataLama?.value || 0) + bagian.amount
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
  // Aturan & filter sama dengan ringkasan dashboard: penjualan dan pengeluaran operasional saja.
  for (const penjualan of daftarPenjualan) {
    if (penjualan.approvalStatus !== "approved" || !apakahPenjualanOperasional(penjualan)) continue;
    const bulan = petaBulan.get(kunciBulan(penjualan.saleDate) || "");
    if (bulan) {
      const nota = hitungLabaNota(penjualan, persen, petaHargaModal);
      bulan.sales += nota.omset;
      bulan.grossProfit = (bulan.grossProfit || 0) + nota.laba;
      bulan.cogs = (bulan.cogs || 0) + nota.modal;
    }
  }

  // Akumulasikan pengeluaran per bulan
  for (const pengeluaran of daftarPengeluaran) {
    if (pengeluaran.approvalStatus !== "approved" || !apakahPengeluaranOperasional(pengeluaran)) continue;
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
    const nota = hitungLabaNota(sale, persen, petaHargaModal);
    const items: ProfitDetailItem[] = nota.items.map((i) => ({
      productRef: i.productRef,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      costPrice: i.modalPerSatuan,
      discount: i.discount,
      revenue: i.omset,
      cost: i.modal,
      grossProfit: i.laba,
      marginPercent: i.omset > 0 ? Number(((i.laba / i.omset) * 100).toFixed(1)) : 0,
      isRealCost: i.modalPerSatuan != null
    }));
    const realItems = items.filter((i) => i.isRealCost).length;
    realCostItemsCount += realItems;
    totalItemsCount += items.length;
    totalRevenue += nota.omset;
    totalCost += nota.modal;
    totalGrossProfit += nota.laba;

    detailSales.push({
      id: sale.id,
      saleDate: sale.saleDate,
      transactionNumber: sale.transactionNumber,
      customerName: sale.customerName,
      paymentMethod: sale.paymentMethod,
      rekeningNameSnapshot: sale.rekeningNameSnapshot,
      tipeCode: kodeTipe(sale),
      revenue: nota.omset,
      cost: nota.modal,
      grossProfit: nota.laba,
      marginPercent: nota.omset > 0 ? Number(((nota.laba / nota.omset) * 100).toFixed(1)) : 0,
      hasRealCost: realItems > 0,
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
