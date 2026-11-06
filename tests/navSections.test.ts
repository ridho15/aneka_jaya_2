import { describe, expect, it } from "vitest";
import { activeNavSection, matchNavHref, visibleNavLinks, visibleNavSections } from "@/components/layout/navigation";
import { ROLES } from "@/lib/auth/roles";

const sectionsOf = (role: (typeof ROLES)[number]) => visibleNavSections(role).flatMap((g) => g.sections);

describe("sidebar ringkas per modul", () => {
  it("setiap halaman yang boleh dibuka tetap bisa dicapai lewat modulnya (tab)", () => {
    for (const role of ROLES) {
      const reachable = new Set(sectionsOf(role).flatMap((s) => s.links.map((l) => l.href)));
      for (const link of visibleNavLinks(role)) expect(reachable.has(link.href), `${role} ${link.href}`).toBe(true);
    }
  });

  it("Super Admin cukup melihat 14 menu, bukan puluhan", () => {
    expect(sectionsOf("OWNER").map((s) => s.label)).toEqual([
      "Dashboard", "Penjualan", "Delivery Order", "Tempo & Piutang", "Pengeluaran",
      "Stok", "Input Stok", "Master Barang", "Kalkulator Modal", "Pembelian", "Laporan", "Akuntansi", "SDM", "Sistem"
    ]);
    expect(visibleNavLinks("OWNER").length).toBeGreaterThan(40);
  });

  it("Admin dan Petugas DO melihat menu yang sedikit", () => {
    expect(sectionsOf("ADMIN").map((s) => s.label)).toEqual(["Penjualan", "Delivery Order", "Tempo & Piutang", "Stok", "Input Stok"]);
    expect(sectionsOf("DELIVERY_DRIVER").map((s) => s.label)).toEqual(["Delivery Order", "Stok"]);
    expect(sectionsOf("ADMIN").find((s) => s.id === "input-stok")?.links.map((l) => l.label)).toEqual(["Transfer Stok", "Stock Opname"]);
    expect(sectionsOf("ADMIN").find((s) => s.id === "penjualan")?.links.map((l) => l.label)).toEqual(["Riwayat", "Draft"]);
  });

  it("menu modul menuju halaman utamanya, dan halaman detail ikut menandai tab yang benar", () => {
    const owner = sectionsOf("OWNER");
    expect(owner.find((s) => s.id === "laporan")?.href).toBe("/reports");
    expect(owner.find((s) => s.id === "penjualan")?.href).toBe("/penjualan");
    expect(matchNavHref("/penjualan/abc123", ["/penjualan", "/penjualan/input"])).toBe("/penjualan");
    expect(matchNavHref("/inventory/mutasi", ["/inventory", "/inventory/mutasi"])).toBe("/inventory/mutasi");
    const { section, href } = activeNavSection("/reports/stocks/print", owner);
    expect(section?.id).toBe("laporan");
    expect(href).toBe("/reports/stocks");
  });
});
