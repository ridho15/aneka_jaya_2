import { describe, expect, it } from "vitest";
import { visibleNavLinks } from "@/components/layout/navigation";
import type { Role } from "@/lib/auth/roles";

const inventoryMenu = (role: Role) => visibleNavLinks(role).filter((l) => l.category === "INVENTORY GUDANG & TOKO").map((l) => l.label);

describe("menu inventory per role", () => {
  it("Super Admin melihat semua menu", () => {
    expect(inventoryMenu("OWNER")).toEqual([
      "Stok Gudang & Toko", "Permintaan Barang Gudang", "Mutasi / Kartu Stok", "Transfer Stok", "Barang Masuk", "Stock Opname",
      "Import Opname Excel", "Stock Adjustment", "Master Barang", "Kalkulator Modal", "Lokasi Stok"
    ]);
  });

  it("Admin hanya stok, opname, transfer", () => {
    expect(inventoryMenu("ADMIN")).toEqual(["Stok Gudang & Toko", "Permintaan Barang Gudang", "Transfer Stok", "Stock Opname"]);
  });

  it("Manager & Supervisor semua kecuali Master Barang, Gudang & Toko (dan Import)", () => {
    const expected = ["Stok Gudang & Toko", "Permintaan Barang Gudang", "Mutasi / Kartu Stok", "Transfer Stok", "Barang Masuk", "Stock Opname", "Stock Adjustment"];
    expect(inventoryMenu("MANAGER")).toEqual(expected);
    expect(inventoryMenu("SUPERVISOR")).toEqual(expected);
  });

  it("Petugas DO (packing) hanya stok dan mutasi", () => {
    expect(inventoryMenu("DELIVERY_DRIVER")).toEqual(["Stok Gudang & Toko", "Permintaan Barang Gudang", "Mutasi / Kartu Stok"]);
  });

  it("Finance dan Viewer tidak melihat inventory", () => {
    expect(inventoryMenu("FINANCE")).toEqual([]);
    expect(inventoryMenu("VIEWER")).toEqual([]);
  });

  it("Admin: menu operasional hanya Riwayat & Draft Penjualan, DO, Tempo; Stock Barang lama sudah digabung", async () => {
    const { visibleNavGroups } = await import("@/components/layout/navigation");
    const ops = visibleNavGroups("ADMIN").find((g) => g.category === "OPERASIONAL & TRANSAKSI")?.links.map((l) => l.label);
    expect(ops).toEqual(["Riwayat Penjualan", "Draft Penjualan", "Delivery Order (DO)", "Tempo & Piutang"]);
    expect(visibleNavLinks("OWNER").some((l) => l.href === "/barang")).toBe(false);
  });
});
