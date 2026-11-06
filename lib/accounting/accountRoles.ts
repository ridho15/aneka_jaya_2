import "server-only";
import type { AccountCategory, NormalBalance } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Akun yang dipakai jurnal otomatis persediaan & aset. Kode yang sudah ada di produksi dipakai apa adanya
 * (tidak dibuat ganda, nama tidak ditimpa). Bila kode itu ternyata dipakai untuk akun lain (nama tidak cocok),
 * posting berhenti dengan pesan konflik supaya tidak salah masuk akun.
 */
export type AccountRole =
  | "INVENTORY"
  | "COGS"
  | "PREPAID"
  | "PURCHASE_ADVANCE"
  | "EQUIPMENT"
  | "ACCUMULATED_DEPRECIATION"
  | "GOODS_RECEIVED_PAYABLE"
  | "CONSIGNMENT_PAYABLE"
  | "ACCOUNTS_PAYABLE"
  | "INVENTORY_VARIANCE"
  | "DEPRECIATION_EXPENSE"
  | "SUPPLIES_EXPENSE";

type RoleDef = {
  code: string;
  name: string;
  category: AccountCategory;
  normalBalance: NormalBalance;
  reportGroup: string | null;
  description: string;
  /** Kata yang harus ada di nama akun yang sudah ada (huruf kecil). */
  keywords: string[];
  sortOrder: number;
};

export const ACCOUNT_ROLES: Record<AccountRole, RoleDef> = {
  INVENTORY: { code: "1-1005", name: "Persediaan Barang Dagang", category: "ASSET", normalBalance: "DEBIT", reportGroup: "CURRENT_ASSET", description: "Barang milik usaha yang dibeli untuk dijual kembali (FIFO).", keywords: ["persediaan"], sortOrder: 50 },
  PREPAID: { code: "1-1007", name: "Biaya Dibayar di Muka", category: "ASSET", normalBalance: "DEBIT", reportGroup: "CURRENT_ASSET", description: "Pembayaran sebelum manfaat jasa diterima.", keywords: ["dibayar di muka", "dibayar dimuka"], sortOrder: 70 },
  PURCHASE_ADVANCE: { code: "1-1008", name: "Uang Muka Pembelian", category: "ASSET", normalBalance: "DEBIT", reportGroup: "CURRENT_ASSET", description: "Uang muka ke supplier sebelum barang diterima.", keywords: ["uang muka pembelian", "uang muka"], sortOrder: 75 },
  EQUIPMENT: { code: "1-2001", name: "Peralatan Toko & Kantor", category: "ASSET", normalBalance: "DEBIT", reportGroup: "FIXED_ASSET", description: "Aset tetap: peralatan yang dipakai usaha.", keywords: ["peralatan"], sortOrder: 80 },
  ACCUMULATED_DEPRECIATION: { code: "1-2002", name: "Akumulasi Penyusutan Peralatan", category: "ASSET", normalBalance: "CREDIT", reportGroup: "CONTRA_FIXED_ASSET", description: "Kontra aset peralatan.", keywords: ["akumulasi penyusutan"], sortOrder: 85 },
  ACCOUNTS_PAYABLE: { code: "2-1001", name: "Utang Usaha", category: "LIABILITY", normalBalance: "CREDIT", reportGroup: "CURRENT_LIABILITY", description: "Kewajiban kepada supplier dari invoice pembelian.", keywords: ["utang usaha", "utang"], sortOrder: 110 },
  GOODS_RECEIVED_PAYABLE: { code: "2-1005", name: "Utang Barang Diterima Belum Dibayar", category: "LIABILITY", normalBalance: "CREDIT", reportGroup: "CURRENT_LIABILITY", description: "Barang dagang sudah masuk stok (Barang Masuk / packing list) tetapi belum dibayar.", keywords: ["barang diterima"], sortOrder: 140 },
  CONSIGNMENT_PAYABLE: { code: "2-1006", name: "Utang Barang Titipan", category: "LIABILITY", normalBalance: "CREDIT", reportGroup: "CURRENT_LIABILITY", description: "Hak penitip atas barang titipan yang sudah terjual (sebesar modal titipan).", keywords: ["titipan"], sortOrder: 145 },
  COGS: { code: "5-1001", name: "Harga Pokok Penjualan (HPP)", category: "EXPENSE", normalBalance: "DEBIT", reportGroup: null, description: "Beban pokok barang yang terjual.", keywords: ["pokok"], sortOrder: 410 },
  INVENTORY_VARIANCE: { code: "5-1002", name: "Selisih & Penyesuaian Persediaan", category: "EXPENSE", normalBalance: "DEBIT", reportGroup: null, description: "Selisih opname dan penyesuaian stok (hilang, rusak, temuan).", keywords: ["selisih", "penyesuaian persediaan"], sortOrder: 420 },
  DEPRECIATION_EXPENSE: { code: "6-1007", name: "Beban Penyusutan Peralatan", category: "EXPENSE", normalBalance: "DEBIT", reportGroup: null, description: "Penyusutan bulanan aset tetap.", keywords: ["penyusutan"], sortOrder: 570 },
  SUPPLIES_EXPENSE: { code: "6-1008", name: "Beban Perlengkapan & Bahan Kemasan", category: "EXPENSE", normalBalance: "DEBIT", reportGroup: null, description: "Bahan kemasan, perlengkapan habis pakai, dan peralatan di bawah batas kapitalisasi.", keywords: ["perlengkapan", "kemasan"], sortOrder: 580 }
};

export class AccountRoleConflictError extends Error {
  constructor(public role: AccountRole, public code: string, public existingName: string) {
    super(`Kode akun ${code} sudah dipakai untuk "${existingName}", bukan ${ACCOUNT_ROLES[role].name}. Atur kode akun ini di Akuntansi › COA sebelum jurnal otomatis bisa jalan.`);
  }
}

export function nameMatchesRole(role: AccountRole, name: string) {
  const lower = name.toLowerCase();
  return ACCOUNT_ROLES[role].keywords.some((k) => lower.includes(k));
}

/** Akun untuk peran tertentu; dibuat bila kodenya belum ada. */
export async function accountForRole(role: AccountRole) {
  const def = ACCOUNT_ROLES[role];
  const existing = await prisma.account.findUnique({ where: { code: def.code } });
  if (existing) {
    if (!nameMatchesRole(role, existing.name)) throw new AccountRoleConflictError(role, def.code, existing.name);
    if (!existing.reportGroup && def.reportGroup) {
      return prisma.account.update({ where: { id: existing.id }, data: { reportGroup: def.reportGroup } });
    }
    return existing;
  }
  return prisma.account.create({
    data: {
      code: def.code, name: def.name, category: def.category, normalBalance: def.normalBalance, reportGroup: def.reportGroup,
      description: def.description, isSystem: true, isActive: true, sortOrder: def.sortOrder
    }
  });
}

/** Status semua akun peran untuk dashboard kelengkapan: ada / dibuat otomatis nanti / konflik. */
export async function accountRoleStatus() {
  const codes = Object.values(ACCOUNT_ROLES).map((d) => d.code);
  const rows = await prisma.account.findMany({ where: { code: { in: codes } } });
  const byCode = new Map(rows.map((r) => [r.code, r]));
  return (Object.keys(ACCOUNT_ROLES) as AccountRole[]).map((role) => {
    const def = ACCOUNT_ROLES[role];
    const row = byCode.get(def.code);
    return {
      role, code: def.code, expectedName: def.name, existingName: row?.name ?? null,
      status: !row ? ("missing" as const) : nameMatchesRole(role, row.name) ? ("ok" as const) : ("conflict" as const)
    };
  });
}

export const lineFor = (account: { id: string; code: string; name: string }, debit: number, credit: number, memo?: string) => ({
  accountId: account.id, accountCodeSnapshot: account.code, accountNameSnapshot: account.name, debit, credit, memo
});
