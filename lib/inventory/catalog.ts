import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Product } from "@/lib/types/product";

/**
 * Master Barang SLM dalam bentuk Product, untuk dashboard & laporan (harga modal, kategori).
 * `id` memakai ID produk ERP lama bila ada, karena item penjualan lama menyimpan ID itu.
 */
export async function listCatalogProducts(options: { activeOnly?: boolean } = {}): Promise<{ success: true; data: Product[] } | { success: false; message: string; data: Product[] }> {
  try {
    const rows = await prisma.inventoryProduct.findMany({
      where: options.activeOnly ? { isActive: true } : undefined,
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, category: true, unit: true, costPrice: true, sellingPrice: true, isActive: true, updatedAt: true, erpProductId: true, minimumStock: true }
    });
    return {
      success: true,
      data: rows.map((p) => ({
        id: p.erpProductId != null ? String(p.erpProductId) : p.id,
        productId: p.id,
        code: p.sku,
        name: p.name,
        category: p.category,
        unit: p.unit,
        costPrice: Number(p.costPrice),
        sellingPrice: Number(p.sellingPrice),
        minimumStock: Number(p.minimumStock),
        isActive: p.isActive,
        updatedAt: p.updatedAt.toISOString()
      }))
    };
  } catch {
    return { success: false, message: "Master Barang SLM gagal dimuat.", data: [] };
  }
}

/** Nama barang per kode (huruf kecil) untuk menampilkan nama di rincian penjualan. Kode tanpa nama asli dilewati. */
export async function productNamesBySku(skus: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(skus.map((s) => s.trim()).filter(Boolean)));
  if (!unique.length) return {};
  try {
    const rows = await prisma.inventoryProduct.findMany({
      where: { sku: { in: unique, mode: "insensitive" } },
      select: { sku: true, name: true }
    });
    const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
    return Object.fromEntries(rows.filter((r) => r.name.trim() && norm(r.name) !== norm(r.sku)).map((r) => [r.sku.toLowerCase(), r.name]));
  } catch {
    return {};
  }
}
