/**
 * INVENTORY_SOURCE menentukan sumber kebenaran stok untuk alur lama (daftar stok,
 * release stok penjualan, alert minimum stok):
 *  - "local" → stok dibaca & dipotong dari modul inventory SLM (database lokal).
 *  - "erp"   → perilaku lama, stok dibaca/dipotong di Anika ERP.
 * Modul inventory SLM (/inventory) selalu memakai database lokal.
 */
export type InventorySource = "local" | "erp";

export function inventorySource(): InventorySource {
  return String(process.env.INVENTORY_SOURCE || "erp").trim().toLowerCase() === "local" ? "local" : "erp";
}

export function isLocalInventory() {
  return inventorySource() === "local";
}

/** Satuan default barang inventory. Semua harga (modal, jual, RMB) dicatat per satuan ini, bukan per pcs. */
export const DEFAULT_UNIT = "Lusin";
