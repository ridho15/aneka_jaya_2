import { generateGeminiJson } from "@/lib/ai/gemini";
import { getStockInventoryReport } from "@/lib/reports/stockReports";
import { listSalesRecords } from "@/lib/sales/store";

export type ReorderUrgency = "CRITICAL" | "WARNING" | "SAFE";

export type ReorderRecommendation = {
  productId: string;
  sku: string;
  productName: string;
  warehouse: string;
  currentStock: number;
  minStock: number;
  unit: string;
  costPrice: number;
  dailyVelocity: number;
  daysUntilStockout: number;
  urgency: ReorderUrgency;
  recommendedReorderQty: number;
  estimatedReorderCost: number;
  reasoning: string;
};

export type DeadStockOptimization = {
  productId: string;
  sku: string;
  productName: string;
  warehouse: string;
  currentStock: number;
  unit: string;
  costPrice: number;
  tiedUpCapital: number;
  daysWithoutSale: number;
  discountRecommendationPercent: number;
  suggestedBundlingWith?: {
    fastMovingSku: string;
    fastMovingName: string;
    bundleStrategy: string;
  };
  actionStrategy: string;
};

export type InventoryAiForecastResult = {
  generatedAt: string;
  model: string;
  summary: {
    totalItemsAnalyzed: number;
    criticalReorderCount: number;
    warningReorderCount: number;
    deadStockItemCount: number;
    totalTiedUpCapital: number;
    estimatedRestockBudget: number;
  };
  executiveSummary: string;
  reorderRecommendations: ReorderRecommendation[];
  deadStockOptimizations: DeadStockOptimization[];
  supplierPoDraft: string;
};

// In-memory cache for 5 minutes
let forecastCache: {
  timestamp: number;
  data: InventoryAiForecastResult;
} | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit

export async function getInventoryAiForecast(options: { forceRefresh?: boolean } = {}): Promise<InventoryAiForecastResult> {
  const now = Date.now();
  if (!options.forceRefresh && forecastCache && now - forecastCache.timestamp < CACHE_TTL_MS) {
    return forecastCache.data;
  }

  // 1. Gather current stock inventory
  const stockReport = await getStockInventoryReport();
  const stockItems = stockReport.items;

  // 2. Gather sales history (last 60 days)
  const allSales = await listSalesRecords();
  const sixtyDaysAgoStr = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const approvedRecentSales = allSales.filter(
    (sale) => sale.approvalStatus === "approved" && sale.saleDate && sale.saleDate >= sixtyDaysAgoStr
  );

  // Compute sales velocity per product / SKU
  const salesMap = new Map<
    string,
    {
      totalQty60d: number;
      totalQty30d: number;
      transactionCount: number;
      lastSaleDate: string;
    }
  >();

  const thirtyDaysAgoStr = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  for (const sale of approvedRecentSales) {
    for (const item of sale.items) {
      const keys = [
        item.productId?.trim().toLowerCase(),
        item.productRef?.trim().toLowerCase(),
        item.manualProduct?.sku?.trim().toLowerCase(),
        item.manualProduct?.name?.trim().toLowerCase()
      ].filter(Boolean) as string[];

      const qty = Number(item.quantity) || 0;
      const saleDate = sale.saleDate || "";

      for (const k of keys) {
        const existing = salesMap.get(k) || {
          totalQty60d: 0,
          totalQty30d: 0,
          transactionCount: 0,
          lastSaleDate: ""
        };

        existing.totalQty60d += qty;
        if (saleDate >= thirtyDaysAgoStr) {
          existing.totalQty30d += qty;
        }
        existing.transactionCount += 1;
        if (!existing.lastSaleDate || saleDate > existing.lastSaleDate) {
          existing.lastSaleDate = saleDate;
        }
        salesMap.set(k, existing);
      }
    }
  }

  // Combine stock items with velocity data
  const aggregatedItems = stockItems.map((item) => {
    const keys = [
      item.productId.trim().toLowerCase(),
      item.sku.trim().toLowerCase(),
      item.productName.trim().toLowerCase()
    ];

    let velocityData = {
      totalQty60d: 0,
      totalQty30d: 0,
      transactionCount: 0,
      lastSaleDate: ""
    };

    for (const k of keys) {
      if (salesMap.has(k)) {
        velocityData = salesMap.get(k)!;
        break;
      }
    }

    const dailyVelocity = Number((velocityData.totalQty30d / 30).toFixed(2));
    let daysUntilStockout = 999;
    if (item.quantity <= 0) {
      daysUntilStockout = 0;
    } else if (dailyVelocity > 0) {
      daysUntilStockout = Math.round(item.quantity / dailyVelocity);
    }

    const daysWithoutSale = velocityData.lastSaleDate
      ? Math.max(0, Math.round((now - new Date(velocityData.lastSaleDate).getTime()) / (24 * 60 * 60 * 1000)))
      : 60;

    return {
      productId: item.productId,
      sku: item.sku,
      productName: item.productName,
      warehouse: item.warehouse,
      quantity: item.quantity,
      unit: item.unit,
      minStock: item.minStock,
      costPrice: item.costPrice,
      totalQty30d: velocityData.totalQty30d,
      dailyVelocity,
      daysUntilStockout,
      daysWithoutSale
    };
  });

  // Sort fast-moving items for potential bundling
  const fastMovingItems = aggregatedItems
    .filter((it) => it.dailyVelocity > 0)
    .sort((a, b) => b.dailyVelocity - a.dailyVelocity)
    .slice(0, 5)
    .map((it) => ({ sku: it.sku, name: it.productName, dailyVelocity: it.dailyVelocity }));

  // Prepare concise payload for Gemini
  const sampleItemsForAi = aggregatedItems.slice(0, 30); // Top 30 items for structured prompt

  const prompt = `Anda adalah AI Supply Chain & Inventory Optimization Expert untuk sistem toko/gudang ritel dan grosir.
Tugas Anda adalah menganalisis data inventaris berikut dan menghasilkan rekomendasi restock presisi serta optimasi barang mati (dead stock).

Data Inventaris & Penjualan Terkini:
${JSON.stringify(sampleItemsForAi, null, 2)}

Daftar Produk Terlaris (Fast Moving) untuk referensi bundling:
${JSON.stringify(fastMovingItems, null, 2)}

Instruksi Output JSON (Wajib format JSON valid tanpa format markdown):
{
  "executiveSummary": "Narasi ringkas bahasa Indonesia 2-3 kalimat mengenai kesehatan stok, jumlah item kritis yang butuh restock, dan total modal tertahan di barang mati.",
  "reorderRecommendations": [
    {
      "productId": "ID produk",
      "sku": "SKU produk",
      "productName": "Nama produk",
      "warehouse": "Nama gudang",
      "currentStock": 0,
      "minStock": 0,
      "unit": "Satuan",
      "costPrice": 0,
      "dailyVelocity": 0.0,
      "daysUntilStockout": 0,
      "urgency": "CRITICAL" | "WARNING" | "SAFE",
      "recommendedReorderQty": 0,
      "estimatedReorderCost": 0,
      "reasoning": "Penjelasan singkat alasan reorder dan estimasi kebutuhan 14 hari ke depan"
    }
  ],
  "deadStockOptimizations": [
    {
      "productId": "ID produk",
      "sku": "SKU produk",
      "productName": "Nama produk",
      "warehouse": "Nama gudang",
      "currentStock": 0,
      "unit": "Satuan",
      "costPrice": 0,
      "tiedUpCapital": 0,
      "daysWithoutSale": 0,
      "discountRecommendationPercent": 10,
      "suggestedBundlingWith": {
        "fastMovingSku": "SKU produk laris",
        "fastMovingName": "Nama produk laris",
        "bundleStrategy": "Contoh: Beli 2 Produk Laris Gratis 1 Produk Deadstock atau Paket Diskon Hemat 15%"
      },
      "actionStrategy": "Strategi pencairan modal barang mati"
    }
  ],
  "supplierPoDraft": "Teks format pemesanan barang (Purchase Order) formal siap kirim via WhatsApp ke supplier untuk barang dengan status CRITICAL dan WARNING."
}
`;

  // Call Gemini API
  const geminiResponse = await generateGeminiJson<any>(prompt, {
    model: "gemini-2.5-flash",
    temperature: 0.2
  });

  let resultData: InventoryAiForecastResult;

  if (geminiResponse.success && geminiResponse.data) {
    const ai = geminiResponse.data;
    const reorders: ReorderRecommendation[] = Array.isArray(ai.reorderRecommendations)
      ? ai.reorderRecommendations.map((r: any) => ({
          productId: r.productId || "",
          sku: r.sku || "",
          productName: r.productName || "",
          warehouse: r.warehouse || "",
          currentStock: Number(r.currentStock) || 0,
          minStock: Number(r.minStock) || 0,
          unit: r.unit || "Pcs",
          costPrice: Number(r.costPrice) || 0,
          dailyVelocity: Number(r.dailyVelocity) || 0,
          daysUntilStockout: Number(r.daysUntilStockout) || 0,
          urgency: (r.urgency === "CRITICAL" || r.urgency === "WARNING" ? r.urgency : "SAFE") as ReorderUrgency,
          recommendedReorderQty: Number(r.recommendedReorderQty) || 0,
          estimatedReorderCost: Number(r.estimatedReorderCost) || (Number(r.recommendedReorderQty) || 0) * (Number(r.costPrice) || 0),
          reasoning: r.reasoning || "Rekomendasi otomatis berbasis laju penjualan harian."
        }))
      : [];

    const deadStocks: DeadStockOptimization[] = Array.isArray(ai.deadStockOptimizations)
      ? ai.deadStockOptimizations.map((d: any) => ({
          productId: d.productId || "",
          sku: d.sku || "",
          productName: d.productName || "",
          warehouse: d.warehouse || "",
          currentStock: Number(d.currentStock) || 0,
          unit: d.unit || "Pcs",
          costPrice: Number(d.costPrice) || 0,
          tiedUpCapital: Number(d.tiedUpCapital) || (Number(d.currentStock) || 0) * (Number(d.costPrice) || 0),
          daysWithoutSale: Number(d.daysWithoutSale) || 30,
          discountRecommendationPercent: Number(d.discountRecommendationPercent) || 10,
          suggestedBundlingWith: d.suggestedBundlingWith || undefined,
          actionStrategy: d.actionStrategy || "Jalankan promosi diskon cuci gudang bertahap."
        }))
      : [];

    const criticalCount = reorders.filter((r) => r.urgency === "CRITICAL").length;
    const warningCount = reorders.filter((r) => r.urgency === "WARNING").length;
    const totalTiedUpCapital = deadStocks.reduce((sum, d) => sum + d.tiedUpCapital, 0);
    const estimatedRestockBudget = reorders.reduce((sum, r) => sum + r.estimatedReorderCost, 0);

    resultData = {
      generatedAt: new Date().toISOString(),
      model: "gemini-2.5-flash",
      summary: {
        totalItemsAnalyzed: aggregatedItems.length,
        criticalReorderCount: criticalCount,
        warningReorderCount: warningCount,
        deadStockItemCount: deadStocks.length,
        totalTiedUpCapital,
        estimatedRestockBudget
      },
      executiveSummary:
        ai.executiveSummary ||
        `Hasil analisis inventaris mendeteksi ${criticalCount} item kritis yang perlu segera di-restock dan ${deadStocks.length} item barang lambat bergerak dengan estimasi modal tertahan sebesar Rp ${totalTiedUpCapital.toLocaleString("id-ID")}.`,
      reorderRecommendations: reorders,
      deadStockOptimizations: deadStocks,
      supplierPoDraft: ai.supplierPoDraft || generateFallbackPoDraft(reorders)
    };
  } else {
    // Fallback deterministic computation if API key is not ready or offline
    resultData = computeDeterministicFallbackForecast(aggregatedItems, fastMovingItems);
  }

  forecastCache = {
    timestamp: now,
    data: resultData
  };

  return resultData;
}

function generateFallbackPoDraft(reorders: ReorderRecommendation[]) {
  const criticalItems = reorders.filter((r) => r.urgency === "CRITICAL" || r.urgency === "WARNING");
  if (criticalItems.length === 0) return "Semua persediaan stok dalam kondisi aman. Tidak ada pesanan darurat.";

  const lines = [
    `*PURCHASE ORDER RESTOCK GUDANG*`,
    `Tanggal: ${new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date())}`,
    `Kepada: Rekan Supplier / Bagian Pembelian`,
    "",
    "Mohon bantuan untuk pengiriman restock barang darurat berikut:",
    ""
  ];

  criticalItems.forEach((it, idx) => {
    lines.push(`${idx + 1}. [${it.sku}] ${it.productName}`);
    lines.push(`   - Jumlah Pesanan: *${it.recommendedReorderQty} ${it.unit}*`);
    lines.push(`   - Lokasi Tujuan: Gudang ${it.warehouse}`);
    lines.push("");
  });

  lines.push("Mohon konfirmasi ketersediaan dan estimasi pengiriman. Terima kasih.");
  return lines.join("\n");
}

function computeDeterministicFallbackForecast(
  aggregatedItems: any[],
  fastMovingItems: any[]
): InventoryAiForecastResult {
  const reorders: ReorderRecommendation[] = [];
  const deadStocks: DeadStockOptimization[] = [];

  for (const item of aggregatedItems) {
    const isCritical = item.quantity <= item.minStock || item.daysUntilStockout <= 3;
    const isWarning = !isCritical && (item.daysUntilStockout <= 7 || item.quantity <= item.minStock * 1.5);

    if (isCritical || isWarning) {
      const urgency: ReorderUrgency = isCritical ? "CRITICAL" : "WARNING";
      const targetStock = Math.max(item.minStock * 2, Math.ceil(item.dailyVelocity * 14));
      const reorderQty = Math.max(1, targetStock - item.quantity);
      reorders.push({
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        warehouse: item.warehouse,
        currentStock: item.quantity,
        minStock: item.minStock,
        unit: item.unit,
        costPrice: item.costPrice,
        dailyVelocity: item.dailyVelocity,
        daysUntilStockout: item.daysUntilStockout,
        urgency,
        recommendedReorderQty: reorderQty,
        estimatedReorderCost: reorderQty * item.costPrice,
        reasoning: isCritical
          ? `Stok kritis (sisa ${item.quantity} ${item.unit}), diprediksi habis dalam ${item.daysUntilStockout} hari.`
          : `Laju penjualan ${item.dailyVelocity} ${item.unit}/hari, perlu pemesanan pengaman untuk 14 hari ke depan.`
      });
    }

    if (item.quantity > 0 && item.daysWithoutSale >= 30 && item.dailyVelocity === 0) {
      const fastPair = fastMovingItems[0];
      deadStocks.push({
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        warehouse: item.warehouse,
        currentStock: item.quantity,
        unit: item.unit,
        costPrice: item.costPrice,
        tiedUpCapital: item.quantity * item.costPrice,
        daysWithoutSale: item.daysWithoutSale,
        discountRecommendationPercent: 15,
        suggestedBundlingWith: fastPair
          ? {
              fastMovingSku: fastPair.sku,
              fastMovingName: fastPair.name,
              bundleStrategy: `Paket Hemat: Beli ${fastPair.name} dapatkan potongan diskon 15% untuk ${item.productName}`
            }
          : undefined,
        actionStrategy: "Jalankan promo cuci gudang atau jadikan bonus bundling untuk membebaskan modal tertahan."
      });
    }
  }

  const criticalCount = reorders.filter((r) => r.urgency === "CRITICAL").length;
  const warningCount = reorders.filter((r) => r.urgency === "WARNING").length;
  const totalTiedUpCapital = deadStocks.reduce((sum, d) => sum + d.tiedUpCapital, 0);
  const estimatedRestockBudget = reorders.reduce((sum, r) => sum + r.estimatedReorderCost, 0);

  return {
    generatedAt: new Date().toISOString(),
    model: "gemini-deterministic-fallback",
    summary: {
      totalItemsAnalyzed: aggregatedItems.length,
      criticalReorderCount: criticalCount,
      warningReorderCount: warningCount,
      deadStockItemCount: deadStocks.length,
      totalTiedUpCapital,
      estimatedRestockBudget
    },
    executiveSummary: `Kondisi inventaris: Terdeteksi ${criticalCount} item berstatus kritis dan ${deadStocks.length} item stok lambat bergerak dengan modal tertahan Rp ${totalTiedUpCapital.toLocaleString("id-ID")}.`,
    reorderRecommendations: reorders,
    deadStockOptimizations: deadStocks,
    supplierPoDraft: generateFallbackPoDraft(reorders)
  };
}
