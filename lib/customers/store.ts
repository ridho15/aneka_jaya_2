import "server-only";
import { prisma } from "@/lib/db/prisma";

export type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
  location: string | null;
  shippingMethod: string | null;
  orderCount: number;
};

/** Sama dengan pengelompokan di Laporan Customer, agar satu orang tidak terhitung dua kali. */
export function customerNameKey(name?: string | null) {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

const clean = (value?: string | null) => {
  const v = (value || "").trim();
  return v || null;
};

type SaleCustomer = {
  customerName?: string | null;
  customerPhone?: string | null;
  customerLocation?: string | null;
  shippingMethod?: string | null;
  transactionAt?: string | null;
  saleDate?: string | null;
};

/**
 * Simpan/perbarui customer dari penjualan. Isian kosong tidak menimpa data lama.
 * Gagal simpan tidak boleh menggagalkan penjualan, jadi error hanya dicatat.
 */
export async function rememberCustomerFromSale(sale: SaleCustomer, options: { countOrder: boolean }) {
  const name = clean(sale.customerName);
  const nameKey = customerNameKey(name);
  if (!name || !nameKey || nameKey === "walk in") return;
  const at = sale.transactionAt || sale.saleDate;
  const lastOrderAt = at && !Number.isNaN(new Date(at).getTime()) ? new Date(at) : new Date();
  const phone = clean(sale.customerPhone);
  const location = clean(sale.customerLocation);
  const shippingMethod = clean(sale.shippingMethod);
  try {
    await prisma.customer.upsert({
      where: { nameKey },
      create: { id: `cus_${crypto.randomUUID()}`, nameKey, name, phone, location, shippingMethod, orderCount: options.countOrder ? 1 : 0, lastOrderAt },
      update: {
        name,
        ...(phone ? { phone } : {}),
        ...(location ? { location } : {}),
        ...(shippingMethod ? { shippingMethod } : {}),
        ...(options.countOrder ? { orderCount: { increment: 1 }, lastOrderAt } : {})
      }
    });
  } catch (error) {
    console.error("[customers] gagal menyimpan customer dari penjualan:", error);
  }
}

/** Cari customer untuk form penjualan; tanpa kata kunci = yang terakhir belanja. */
export async function searchCustomers(query: string, limit = 8): Promise<CustomerOption[]> {
  const q = query.trim();
  const rows = await prisma.customer.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\D/g, "") || q } }] }
      : undefined,
    orderBy: [{ lastOrderAt: { sort: "desc", nulls: "last" } }, { name: "asc" }],
    take: Math.min(20, Math.max(1, limit)),
    select: { id: true, name: true, phone: true, location: true, shippingMethod: true, orderCount: true }
  });
  return rows;
}
