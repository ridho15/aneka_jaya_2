import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiInventoryForecastView } from "@/components/stocks/AiInventoryForecastView";
import type { InventoryAiForecastResult } from "@/lib/ai/inventoryForecast";

const mockData: InventoryAiForecastResult = {
  generatedAt: "2026-09-01T12:00:00.000Z",
  executiveSummary: "Kondisi stok gudang aman secara umum namun terdapat 2 produk kritis yang perlu segera direorder.",
  reorderRecommendations: [
    {
      productId: "p1",
      productName: "Beras Premium 5kg",
      sku: "BRS-001",
      warehouse: "Gudang Utama",
      currentStock: 5,
      minStock: 20,
      dailyVelocity: 5,
      daysUntilStockout: 1,
      urgency: "CRITICAL",
      recommendedReorderQty: 50,
      estimatedReorderCost: 3500000,
      unit: "sak",
      reasoning: "Stok akan habis dalam 1 hari."
    },
    {
      productId: "p2",
      productName: "Minyak Goreng 2L",
      sku: "MYK-002",
      warehouse: "Gudang Cabang",
      currentStock: 12,
      minStock: 20,
      dailyVelocity: 2,
      daysUntilStockout: 6,
      urgency: "WARNING",
      recommendedReorderQty: 30,
      estimatedReorderCost: 900000,
      unit: "pcs",
      reasoning: "Stok tersisa untuk 6 hari."
    }
  ],
  deadStockOptimizations: [
    {
      productId: "p3",
      productName: "Kecap Manis Jumbo",
      sku: "KCP-003",
      warehouse: "Gudang Utama",
      currentStock: 40,
      unit: "botol",
      daysWithoutSale: 75,
      tiedUpCapital: 1200000,
      discountRecommendationPercent: 20,
      actionStrategy: "Beri diskon 20% dan bundling.",
      suggestedBundlingWith: {
        fastMovingSku: "BRS-001",
        fastMovingName: "Beras Premium 5kg",
        bundleStrategy: "Beli Beras 5kg gratis Kecap diskon 20%"
      }
    }
  ],
  supplierPoDraft: "*SURAT PESANAN RESTOCK BARANG (PO)*\n1. Beras Premium 5kg - Qty: +50 sak\n2. Minyak Goreng 2L - Qty: +30 pcs",
  summary: {
    totalItemsAnalyzed: 3,
    criticalReorderCount: 1,
    warningReorderCount: 1,
    estimatedRestockBudget: 4400000,
    deadStockItemCount: 1,
    totalTiedUpCapital: 1200000
  }
};

describe("AiInventoryForecastView Component", () => {
  it("renders the intelligence header without third-party provider names", () => {
    const html = renderToStaticMarkup(<AiInventoryForecastView initialData={mockData} />);
    expect(html).toContain("Intelligence Engine");
    expect(html).toContain("Prediksi &amp; Analisis Persediaan");
    expect(html).not.toContain("Gemini");
    expect(html).not.toContain("Google");
  });

  it("renders search input, warehouse filter, and pagination controls", () => {
    const html = renderToStaticMarkup(<AiInventoryForecastView initialData={mockData} />);
    expect(html).toContain("Cari nama barang atau kode SKU...");
    expect(html).toContain("Semua Lokasi Gudang");
    expect(html).toContain("Gudang: Gudang Utama");
    expect(html).toContain("Gudang: Gudang Cabang");
    expect(html).toContain("Urutkan: Paling Kritis");
    expect(html).toContain("Beras Premium 5kg");
    expect(html).toContain("Minyak Goreng 2L");
    expect(html).toContain("Menampilkan");
    expect(html).toContain("Sebelumnya");
    expect(html).toContain("Berikutnya");
  });
});
