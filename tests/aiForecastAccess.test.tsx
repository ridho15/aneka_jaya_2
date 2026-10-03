import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { visibleNavLinks, visibleNavGroups } from "@/components/layout/navigation";
import { ROLES, type Role } from "@/lib/auth/roles";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock("@/components/stocks/AiInventoryForecastView", () => ({
  AiInventoryForecastView: () => <div data-testid="ai-forecast-view">AI Forecast Content</div>,
}));

vi.mock("@/components/stocks/StockList", () => ({
  StockList: () => <div data-testid="stock-list-table">Stock List Table</div>,
}));

vi.mock("@/components/products/ProductList", () => ({
  ProductList: () => <div data-testid="product-list-table">Product List Table</div>,
}));

vi.mock("@/lib/ai/inventoryForecast", () => ({
  getInventoryAiForecast: vi.fn().mockResolvedValue({
    generatedAt: new Date().toISOString(),
    totalAnalyzedItems: 10,
    deadStockCount: 2,
    restockCount: 3,
    deadStockCapital: 5000000,
    recommendedPurchaseCapital: 3000000,
    recommendations: [],
  }),
}));

vi.mock("@/lib/erp/stocks", () => ({
  listStocksPage: vi.fn().mockResolvedValue({
    success: true,
    data: {
      data: [],
      meta: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
    },
  }),
  listStocks: vi.fn().mockResolvedValue({
    success: true,
    data: [],
  }),
}));

vi.mock("@/lib/erp/products", () => ({
  listProductTablePage: vi.fn().mockResolvedValue({
    success: true,
    data: {
      data: [],
      meta: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
    },
  }),
}));

vi.mock("@/lib/reports/stockInventory", () => ({
  getStockInventoryReport: vi.fn().mockResolvedValue({
    summary: {
      totalValuation: 1000000,
      totalPhysicalQuantity: 50,
      belowMinimumCount: 2,
      normalCount: 48,
    },
    items: [],
  }),
}));

const authMocks = vi.hoisted(() => ({
  currentRole: "OWNER" as Role,
  getCurrentRole: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentRole: authMocks.getCurrentRole,
}));

const { default: AiInventoryForecastPage } = await import("@/app/stok-barang/ai-forecast/page");
const { default: StokBarangPage } = await import("@/app/stok-barang/page");
const { default: BarangPage } = await import("@/app/barang/page");
const { default: StockReportsPage } = await import("@/app/reports/stocks/page");

describe("Verifikasi Pembatasan Akses AI Prediksi Stok", () => {
  beforeEach(() => {
    authMocks.currentRole = "OWNER";
    authMocks.getCurrentRole.mockImplementation(async () => authMocks.currentRole);
  });

  describe("1. Route Gate (/stok-barang/ai-forecast)", () => {
    it("mengizinkan role OWNER masuk tanpa redirect", async () => {
      authMocks.currentRole = "OWNER";
      const result = await AiInventoryForecastPage();
      const html = renderToStaticMarkup(result);
      expect(html).toContain("AI Forecast Content");
    });

    const nonOwnerRoles: Role[] = ["SUPERVISOR", "ADMIN", "FINANCE", "MANAGER", "VIEWER"];

    nonOwnerRoles.forEach((role) => {
      it(`me-redirect role ${role} ke /stok-barang`, async () => {
        authMocks.currentRole = role;
        await expect(AiInventoryForecastPage()).rejects.toThrow("redirect:/stok-barang");
      });
    });
  });

  describe("2. Navigasi Sidebar & Drawer (visibleNavLinks & visibleNavGroups)", () => {
    it("hanya menampilkan menu AI Prediksi Stok untuk role OWNER", () => {
      const ownerLinks = visibleNavLinks("OWNER").map((l) => l.href);
      expect(ownerLinks).toContain("/stok-barang/ai-forecast");

      const nonOwnerRoles: Role[] = ["SUPERVISOR", "ADMIN", "FINANCE", "MANAGER", "VIEWER"];
      for (const role of nonOwnerRoles) {
        const links = visibleNavLinks(role).map((l) => l.href);
        expect(links).not.toContain("/stok-barang/ai-forecast");

        const groups = visibleNavGroups(role);
        const groupLinks = groups.flatMap((g) => g.links.map((l) => l.href));
        expect(groupLinks).not.toContain("/stok-barang/ai-forecast");
      }
    });
  });

  describe("3. Tombol Akses di Halaman /stok-barang", () => {
    it("menampilkan tombol Prediksi Stok untuk OWNER", async () => {
      authMocks.currentRole = "OWNER";
      const html = renderToStaticMarkup(await StokBarangPage({ searchParams: Promise.resolve({}) }));
      expect(html).toContain('href="/stok-barang/ai-forecast"');
      expect(html).toContain("Prediksi Stok &amp; Dead Stock");
    }, 15000);

    it("tidak menampilkan tombol Prediksi Stok untuk SUPERVISOR", async () => {
      authMocks.currentRole = "SUPERVISOR";
      const html = renderToStaticMarkup(await StokBarangPage({ searchParams: Promise.resolve({}) }));
      expect(html).not.toContain('href="/stok-barang/ai-forecast"');
      expect(html).not.toContain("Prediksi Stok &amp; Dead Stock");
    }, 15000);
  });

  describe("4. Tombol Akses di Halaman /barang", () => {
    it("menampilkan tombol Prediksi Stok untuk OWNER", async () => {
      authMocks.currentRole = "OWNER";
      const html = renderToStaticMarkup(await BarangPage({ searchParams: Promise.resolve({}) }));
      expect(html).toContain('href="/stok-barang/ai-forecast"');
      expect(html).toContain("Prediksi Stok &amp; Dead Stock");
    }, 15000);

    it("tidak menampilkan tombol Prediksi Stok untuk SUPERVISOR", async () => {
      authMocks.currentRole = "SUPERVISOR";
      const html = renderToStaticMarkup(await BarangPage({ searchParams: Promise.resolve({}) }));
      expect(html).not.toContain('href="/stok-barang/ai-forecast"');
      expect(html).not.toContain("Prediksi Stok &amp; Dead Stock");
    }, 15000);
  });

  describe("5. Tombol Akses di Halaman /reports/stocks", () => {
    it("menampilkan tombol Prediksi Stok untuk OWNER", async () => {
      authMocks.currentRole = "OWNER";
      const html = renderToStaticMarkup(await StockReportsPage({ searchParams: Promise.resolve({}) }));
      expect(html).toContain('href="/stok-barang/ai-forecast"');
      expect(html).toContain("Prediksi Stok");
    }, 15000);

    it("tidak menampilkan tombol Prediksi Stok untuk SUPERVISOR", async () => {
      authMocks.currentRole = "SUPERVISOR";
      const html = renderToStaticMarkup(await StockReportsPage({ searchParams: Promise.resolve({}) }));
      expect(html).not.toContain('href="/stok-barang/ai-forecast"');
      expect(html).not.toContain("Prediksi Stok");
    }, 15000);

    it("me-redirect FINANCE yang tidak memiliki izin stok atau laporan persediaan ke /", async () => {
      authMocks.currentRole = "FINANCE";
      await expect(StockReportsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/");
    });
  });
});
