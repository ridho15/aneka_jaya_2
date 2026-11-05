/**
 * INVENTORY_SOURCE menentukan sumber kebenaran stok untuk alur lama (daftar stok,
 * release stok penjualan, alert minimum stok):
 *  - "local" (default) → barang & stok dibaca/dipotong dari modul inventory SLM.
 *  - "erp"   → perilaku lama, barang & stok dari Anika ERP (hanya untuk rollback).
 * Modul inventory SLM (/inventory) selalu memakai database lokal.
 */
export type InventorySource = "local" | "erp";

export function inventorySource(): InventorySource {
  return String(process.env.INVENTORY_SOURCE || "local").trim().toLowerCase() === "erp" ? "erp" : "local";
}

export function isLocalInventory() {
  return inventorySource() === "local";
}

/** Satuan default barang inventory. Semua harga (modal, jual, RMB) dicatat per satuan ini, bukan per pcs. */
export const DEFAULT_UNIT = "Lusin";

export type StockViewType = "STORE" | "WAREHOUSE" | "ALL";

/** Tampilan stok bawaan: Super Admin melihat Gudang + Toko, role lain Toko. Pilihan di URL tetap menang. */
export function stockViewType(requested: string | undefined, role: string): StockViewType {
  if (requested === "STORE" || requested === "WAREHOUSE" || requested === "ALL") return requested;
  return role === "OWNER" ? "ALL" : "STORE";
}
