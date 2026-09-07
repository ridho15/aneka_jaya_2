import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MobileNavigationDrawer } from "@/components/layout/MobileNavigationDrawer";
import { Sidebar } from "@/components/layout/Sidebar";
import { isNavLinkActive, visibleNavLinks, visibleNavGroups } from "@/components/layout/navigation";

vi.mock("next/navigation", () => ({
  usePathname: () => "/penjualan"
}));

describe("global navigation", () => {
  it("filters visible links by role and never exposes deferred purchase navigation", () => {
    const ownerLinks = visibleNavLinks("OWNER");
    const viewerLinks = visibleNavLinks("VIEWER");

    expect(ownerLinks.some((link) => link.href === "/settings")).toBe(true);
    expect(viewerLinks.some((link) => link.href === "/settings")).toBe(false);
    expect(ownerLinks.some((link) => link.href.startsWith("/pembelian"))).toBe(false);
  });

  it("shows exactly the sales and delivery order menus to Admin", () => {
    expect(visibleNavLinks("ADMIN").map((link) => [link.href, link.label])).toEqual([
      ["/penjualan/input", "Input Penjualan"],
      ["/penjualan", "Riwayat Penjualan"],
      ["/penjualan/draft", "Draft Penjualan"],
      ["/delivery-orders", "Delivery Order (DO)"],
    ]);
  });

  it("shows exactly Delivery Order menu to Petugas DO (DELIVERY_DRIVER)", () => {
    expect(visibleNavLinks("DELIVERY_DRIVER").map((link) => [link.href, link.label])).toEqual([
      ["/delivery-orders", "Delivery Order (DO)"],
    ]);
  });

  it("keeps nested sections active for their parent navigation item", () => {
    expect(isNavLinkActive("/settings/rekening", "/settings")).toBe(true);
    expect(isNavLinkActive("/barang/item-1/edit", "/barang")).toBe(true);
    expect(isNavLinkActive("/penjualan/input", "/penjualan")).toBe(false);
  });

  it("renders mobile drawer controls and permitted links", () => {
    const html = renderToStaticMarkup(<MobileNavigationDrawer role="OWNER" userName="Ridho Al Amzah" />);

    expect(html).toContain('aria-label="Buka menu"');
    expect(html).toContain('aria-controls="mobile-navigation-drawer"');
    expect(html).not.toContain('aria-label="Tutup menu"');
    expect(html).not.toContain('href="/penjualan"');
    expect(html).not.toContain("/pembelian");
  });

  it("keeps desktop sidebar available only on large breakpoints", () => {
    const html = renderToStaticMarkup(<Sidebar role="OWNER" />);

    expect(html).toContain("lg:block");
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("Dashboard");
    expect(html).toContain("MENU UTAMA");
    expect(html).toContain("OPERASIONAL &amp; TRANSAKSI");
    expect(html).toContain("PUSAT LAPORAN");
    expect(html).toContain("SISTEM &amp; MONITORING");
    expect(html).not.toContain("overflow-x-auto");
    expect(html).not.toContain("/pembelian");
  });

  it("groups navigation into categories and excludes redundant inputs for Super Admin", () => {
    const groups = visibleNavGroups("OWNER");

    expect(groups.map((g) => g.category)).toEqual([
      "MENU UTAMA",
      "OPERASIONAL & TRANSAKSI",
      "PUSAT LAPORAN",
      "SISTEM & MONITORING",
    ]);

    const operasionalGroup = groups.find((g) => g.category === "OPERASIONAL & TRANSAKSI");
    expect(operasionalGroup?.links.some((l) => l.href === "/penjualan/input")).toBe(false);
    expect(operasionalGroup?.links.some((l) => l.href === "/penjualan")).toBe(true);
  });
});
