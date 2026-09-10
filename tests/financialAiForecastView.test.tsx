import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiFinancialForecastView } from "@/components/finance/AiFinancialForecastView";
import type { FinancialAiForecastResult } from "@/lib/ai/financialAiService";

const mockFinancialData: FinancialAiForecastResult = {
  generatedAt: "2026-09-09T10:00:00.000Z",
  model: "Finance-Intelligence-Deterministic",
  baseMetrics: {
    totalSalesCount: 15,
    totalExpenseCount: 8,
    past30DaysRevenue: 100000000,
    past30DaysGrossProfit: 10000000,
    past30DaysGrossMarginPercent: 10,
    past30DaysExpenses: 5000000,
    past30DaysNettProfit: 5000000,
    currentCashBalance: 35000000,
    minimumBufferThreshold: 27386562,
    dailyBurnRate: 166666,
    activeReceivablesTotal: 25000000,
    overdueReceivablesTotal: 5000000,
    overdueCount: 2,
    topExpenseCategories: [
      { category: "Operasional & Logistik", amount: 3000000, percentage: 60 },
      { category: "Gaji & Upah", amount: 2000000, percentage: 40 }
    ]
  },
  projections: {
    runwayDays: 30,
    healthStatus: "HEALTHY",
    predictedCashInflow30Days: 45000000,
    predictedCashOutflow30Days: 20000000,
    lowestProjectedCashPoint: 28000000,
    criticalCashDeficitCount: 0
  },
  dailyTimeline: Array.from({ length: 30 }, (_, i) => ({
    dayNumber: i + 1,
    date: `2026-09-${String(i + 10).padStart(2, "0")}`,
    projectedInflow: 1500000,
    projectedOutflow: 700000,
    projectedBalance: 35000000 + (i * 800000),
    isBufferBreached: false,
    inflowBreakdown: {
      expectedDailySales: 1000000,
      expectedTempoCollections: 500000
    },
    outflowBreakdown: {
      expectedOperationalExpenses: 400000,
      expectedRestock: 300000
    }
  })),
  priorityCollections: [
    {
      invoiceId: "inv-1",
      customerName: "Toko Sinar Rezeki",
      amount: 4500000,
      dueDate: "2026-09-12",
      daysUntilDue: 3,
      urgency: "MEDIUM",
      suggestedScript: "Selamat pagi Bapak/Ibu Toko Sinar Rezeki, konfirmasi tagihan tempo."
    }
  ],
  criticalAlerts: [],
  executiveSummary: {
    cashHealthAssessment: "Likuiditas kas sangat sehat di atas ambang batas aman.",
    costEfficiencyAnalysis: "Beban operasional terkendali dengan efisiensi tinggi.",
    accountsReceivableHealth: "Piutang tempo tertagih dengan lancar.",
    weeklyActionPriorities: [
      "Prioritaskan follow-up piutang tempo minggu ini.",
      "Pertahankan cadangan kas operasional."
    ]
  }
};

describe("AiFinancialForecastView Component", () => {
  it("renders navigation tabs with consistent emerald primary color classes", () => {
    const html = renderToStaticMarkup(<AiFinancialForecastView initialData={mockFinancialData} />);
    
    // Check navigation tabs
    expect(html).toContain("Proyeksi Arus Kas 30 Hari");
    expect(html).toContain("Executive CFO Briefing");
    expect(html).toContain("Konsultasi Finansial Interaktif");
    
    // Active tab uses primary emerald-600 background and white text
    expect(html).toContain("bg-emerald-600 text-white shadow-xs");
    expect(html).toContain("bg-emerald-700 text-emerald-100");
  });

  it("renders intuitive cash runway curve chart with SVG and buffer threshold", () => {
    const html = renderToStaticMarkup(<AiFinancialForecastView initialData={mockFinancialData} />);
    
    // Curve chart title and controls
    expect(html).toContain("Kurva Proyeksi Ketahanan Saldo Kas (30 Hari)");
    expect(html).toContain("Kurva Saldo Kas");
    expect(html).toContain("Mutasi Kas (Bar)");
    
    // SVG curve elements
    expect(html).toContain("<svg");
    expect(html).toContain("viewBox=\"0 0 900 240\"");
    expect(html).toContain("cashCurveGrad");
    expect(html).toContain("Batas Aman:");
    expect(html).toContain("H+1");
    expect(html).toContain("H+30");
  });

  it("renders quick liquidity runway summary strip and daily liquidity detail card", () => {
    const html = renderToStaticMarkup(<AiFinancialForecastView initialData={mockFinancialData} />);
    
    expect(html).toContain("Saldo Awal (H+1)");
    expect(html).toContain("Titik Terendah 30 Hari");
    expect(html).toContain("Titik Tertinggi 30 Hari");
    expect(html).toContain("Evaluasi Cadangan Buffer");
    expect(html).toContain("Cadangan Aman 30 Hari");
    
    // Daily Liquidity Detail Card
    expect(html).toContain("Proyeksi Saldo Kas");
    expect(html).toContain("Kas Masuk Harian (+)");
    expect(html).toContain("Kas Keluar Harian (-)");
    expect(html).toContain("Arus Kas Bersih (Net Flow)");
  });

  it("has zero emoticons and no AI slop in rendered UI", () => {
    const html = renderToStaticMarkup(<AiFinancialForecastView initialData={mockFinancialData} />);
    
    // Check for common emojis
    const emojiRegex = /[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/u;
    expect(emojiRegex.test(html)).toBe(false);
  });
});
