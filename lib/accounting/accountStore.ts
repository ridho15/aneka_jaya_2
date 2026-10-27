import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { AccountCategory, NormalBalance, Prisma } from "@prisma/client";
import type { AccountInput } from "@/lib/validation/accountingSchema";
import { recordAudit } from "@/lib/audit/store";
import type { Role } from "@/lib/auth/roles";

export type StandardAccountSeed = {
  code: string;
  name: string;
  category: AccountCategory;
  normalBalance: NormalBalance;
  description: string;
  isSystem: boolean;
  sortOrder: number;
};

export const STANDARD_ACCOUNTS: StandardAccountSeed[] = [
  // 1. ASET
  { code: "1-1001", name: "Kas & Bank", category: "ASSET", normalBalance: "DEBIT", description: "Rekening kas fisik & rekening bank operasional", isSystem: true, sortOrder: 10 },
  { code: "1-1002", name: "Uang Muka Operasional", category: "ASSET", normalBalance: "DEBIT", description: "Titipan uang muka dinas operasional karyawan", isSystem: true, sortOrder: 20 },
  { code: "1-1003", name: "Piutang Karyawan", category: "ASSET", normalBalance: "DEBIT", description: "Piutang kasbon pribadi karyawan perusahaan", isSystem: true, sortOrder: 30 },
  { code: "1-1004", name: "Piutang Usaha", category: "ASSET", normalBalance: "DEBIT", description: "Piutang penjualan tempo pelanggan / customer", isSystem: true, sortOrder: 40 },
  { code: "1-1005", name: "Persediaan Barang Dagang", category: "ASSET", normalBalance: "DEBIT", description: "Nilai persediaan barang dagang di gudang", isSystem: true, sortOrder: 50 },
  { code: "1-1006", name: "Pajak Dibayar Dimuka (PPN & PPh Impor)", category: "ASSET", normalBalance: "DEBIT", description: "Pajak masukan dan PPh 22 impor yang dapat dikreditkan", isSystem: true, sortOrder: 60 },

  // 2. KEWAJIBAN / LIABILITAS
  { code: "2-1001", name: "Utang Usaha", category: "LIABILITY", normalBalance: "CREDIT", description: "Kewajiban pembayaran kepada supplier / vendor", isSystem: true, sortOrder: 110 },
  { code: "2-1002", name: "Utang Gaji", category: "LIABILITY", normalBalance: "CREDIT", description: "Akrual kewajiban gaji dan potongan payroll karyawan", isSystem: true, sortOrder: 120 },
  { code: "2-1003", name: "Utang Simpanan Karyawan", category: "LIABILITY", normalBalance: "CREDIT", description: "Titipan simpanan wajib / sukarela karyawan", isSystem: true, sortOrder: 130 },
  { code: "2-1004", name: "Utang PPN Keluaran", category: "LIABILITY", normalBalance: "CREDIT", description: "Pajak Pertambahan Nilai yang dipungut dari transaksi penjualan", isSystem: true, sortOrder: 135 },

  // 3. EKUITAS
  { code: "3-1001", name: "Modal Pemilik", category: "EQUITY", normalBalance: "CREDIT", description: "Modal awal disetor dan ekuitas pemilik perusahaan", isSystem: true, sortOrder: 210 },
  { code: "3-1002", name: "Laba Ditahan", category: "EQUITY", normalBalance: "CREDIT", description: "Akumulasi laba rugi tahun-tahun sebelumnya", isSystem: true, sortOrder: 220 },

  // 4. PENDAPATAN
  { code: "4-1001", name: "Pendapatan Penjualan", category: "REVENUE", normalBalance: "CREDIT", description: "Pendapatan dari penjualan produk & jasa", isSystem: true, sortOrder: 310 },
  { code: "4-1002", name: "Pendapatan Selisih Kurs", category: "REVENUE", normalBalance: "CREDIT", description: "Laba selisih kurs valuta asing terealisasi & revaluasi", isSystem: true, sortOrder: 320 },
  { code: "4-1003", name: "Retur & Potongan Penjualan", category: "REVENUE", normalBalance: "DEBIT", description: "Kontra akun pendapatan atas retur dan potongan penjualan", isSystem: true, sortOrder: 330 },

  // 5. HARGA POKOK PENJUALAN
  { code: "5-1001", name: "Harga Pokok Penjualan (HPP)", category: "EXPENSE", normalBalance: "DEBIT", description: "Beban pokok barang yang terjual", isSystem: true, sortOrder: 410 },

  // 6. BEBAN OPERASIONAL
  { code: "6-1001", name: "Beban Operasional Umum", category: "EXPENSE", normalBalance: "DEBIT", description: "Biaya operasional kantor & administrasi umum", isSystem: true, sortOrder: 510 },
  { code: "6-1002", name: "Beban Gaji Karyawan", category: "EXPENSE", normalBalance: "DEBIT", description: "Biaya kompensasi & gaji bersih karyawan", isSystem: true, sortOrder: 520 },
  { code: "6-1003", name: "Beban Transport & Logistik", category: "EXPENSE", normalBalance: "DEBIT", description: "Bahan bakar, tol, kurir, dan ekspedisi", isSystem: true, sortOrder: 530 },
  { code: "6-1004", name: "Beban Pemeliharaan & Perbaikan", category: "EXPENSE", normalBalance: "DEBIT", description: "Biaya servis armada, gedung, dan perlengkapan", isSystem: false, sortOrder: 540 },
  { code: "6-1005", name: "Beban Utilitas & Komunikasi", category: "EXPENSE", normalBalance: "DEBIT", description: "Listrik, air, internet, telepon, dan pulsa", isSystem: false, sortOrder: 550 },
  { code: "6-1006", name: "Kerugian Selisih Kurs", category: "EXPENSE", normalBalance: "DEBIT", description: "Rugi selisih kurs valuta asing terealisasi pembayaran utang", isSystem: true, sortOrder: 560 }
];

export async function ensureStandardAccounts(): Promise<void> {
  if (!prisma?.account?.upsert) return;
  for (const acc of STANDARD_ACCOUNTS) {
    await prisma.account.upsert({
      where: { code: acc.code },
      create: {
        code: acc.code,
        name: acc.name,
        category: acc.category,
        normalBalance: acc.normalBalance,
        description: acc.description,
        isSystem: acc.isSystem,
        sortOrder: acc.sortOrder,
        isActive: true
      },
      update: {
        // preserve existing name if customized, but ensure system flags
        isSystem: acc.isSystem
      }
    });
  }
}

export type AccountRow = Awaited<ReturnType<typeof listAccounts>>[number];

export async function listAccounts(filters: {
  category?: AccountCategory;
  isActive?: boolean;
  keyword?: string;
} = {}) {
  await ensureStandardAccounts();

  const where: Prisma.AccountWhereInput = {};
  if (filters.category) where.category = filters.category;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.keyword?.trim()) {
    const q = filters.keyword.trim();
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } }
    ];
  }

  return prisma.account.findMany({
    where,
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { code: "asc" }]
  });
}

export async function getAccountByCode(code: string) {
  await ensureStandardAccounts();
  return prisma.account.findUnique({
    where: { code }
  });
}

export async function getAccountById(id: string) {
  return prisma.account.findUnique({
    where: { id }
  });
}

export async function createAccount(input: AccountInput, actor: { id: string; name: string; role: Role }) {
  const existing = await prisma.account.findUnique({ where: { code: input.code } });
  if (existing) {
    throw new Error(`Akun dengan kode ${input.code} sudah terdaftar (${existing.name}).`);
  }

  const account = await prisma.account.create({
    data: {
      code: input.code,
      name: input.name,
      category: input.category,
      normalBalance: input.normalBalance,
      description: input.description || null,
      sortOrder: input.sortOrder || 0,
      isActive: input.isActive ?? true,
      isSystem: false
    }
  });

  await recordAudit({
    entityType: "coa",
    entityId: account.id,
    action: "create",
    afterValue: account,
    reason: `Tambah akun perkiraan baru: ${account.code} - ${account.name}`
  });

  return account;
}

export async function updateAccount(
  id: string,
  input: Partial<AccountInput>,
  actor: { id: string; name: string; role: Role }
) {
  const before = await prisma.account.findUnique({ where: { id } });
  if (!before) throw new Error("Akun perkiraan tidak ditemukan.");

  // If code changed, check uniqueness
  if (input.code && input.code !== before.code) {
    if (before.isSystem) {
      throw new Error("Kode akun sistem bawaan tidak dapat diubah.");
    }
    const duplicate = await prisma.account.findUnique({ where: { code: input.code } });
    if (duplicate && duplicate.id !== id) {
      throw new Error(`Akun dengan kode ${input.code} sudah digunakan.`);
    }
  }

  const account = await prisma.account.update({
    where: { id },
    data: {
      code: before.isSystem || !input.code ? before.code : input.code,
      name: input.name ?? before.name,
      category: before.isSystem || !input.category ? before.category : input.category,
      normalBalance: before.isSystem || !input.normalBalance ? before.normalBalance : input.normalBalance,
      description: input.description !== undefined ? (input.description || null) : before.description,
      sortOrder: input.sortOrder !== undefined ? input.sortOrder : before.sortOrder,
      isActive: input.isActive !== undefined ? input.isActive : before.isActive
    }
  });

  await recordAudit({
    entityType: "coa",
    entityId: id,
    action: "update",
    beforeValue: before,
    afterValue: account,
    reason: `Update akun perkiraan: ${account.code} - ${account.name}`
  });

  return account;
}

export async function deleteAccount(id: string, actor: { id: string; name: string; role: Role }) {
  const account = await prisma.account.findUnique({
    where: { id },
    include: { journalLines: { take: 1 } }
  });

  if (!account) throw new Error("Akun perkiraan tidak ditemukan.");
  if (account.isSystem) {
    throw new Error("Akun sistem bawaan tidak dapat dihapus.");
  }
  if (account.journalLines.length > 0) {
    throw new Error("Akun ini memiliki riwayat transaksi jurnal dan tidak dapat dihapus. Anda dapat menonaktifkannya.");
  }

  await prisma.account.delete({ where: { id } });

  await recordAudit({
    entityType: "coa",
    entityId: id,
    action: "archive",
    beforeValue: account,
    reason: `Hapus akun perkiraan: ${account.code} - ${account.name}`
  });

  return account;
}
