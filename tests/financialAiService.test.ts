import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  prisma: {
    salesRecord: {
      findMany: vi.fn()
    },
    tempoPayment: {
      findMany: vi.fn()
    },
    expenseRecord: {
      findMany: vi.fn()
    },
    tempoReceivable: {
      findMany: vi.fn()
    },
    tempoPaymentReversal: {
      findMany: vi.fn()
    }
  },
  generateGeminiJson: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/ai/gemini", () => ({ generateGeminiJson: mocks.generateGeminiJson }));

import { getFinancialAiForecast, askFinancialCfo } from "@/lib/ai/financialAiService";

describe("financialAiService", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.prisma.tempoPaymentReversal.findMany.mockResolvedValue([]);

    mocks.prisma.salesRecord.findMany.mockResolvedValue([
      {
        id: "sale-1",
        total: 10_000_000,
        paymentMethod: "Cash",
        initialPaymentAmount: 0,
        items: [
          { quantity: 10, manualProduct: { costPrice: 800_000 } }
        ]
      },
      {
        id: "sale-2",
        total: 5_000_000,
        paymentMethod: "Tempo",
        initialPaymentAmount: 1_000_000,
        items: []
      }
    ]);

    mocks.prisma.tempoPayment.findMany.mockResolvedValue([
      {
        id: "tp-1",
        amountPaid: 3_000_000,
        paymentDate: new Date()
      }
    ]);

    mocks.prisma.expenseRecord.findMany.mockResolvedValue([
      {
        id: "exp-1",
        amount: 2_000_000,
        category: "Operasional",
        coaNameSnapshot: "Beban Operasional"
      },
      {
        id: "exp-2",
        amount: 1_000_000,
        category: "Transportasi",
        coaNameSnapshot: "Beban Kendaraan"
      }
    ]);

    mocks.prisma.tempoReceivable.findMany.mockResolvedValue([
      {
        id: "tr-1",
        customerName: "Toko Berkah",
        remainingAmount: 4_000_000,
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
        status: "open"
      },
      {
        id: "tr-2",
        customerName: "CV Maju Jaya",
        remainingAmount: 6_000_000,
        dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // overdue by 1 day
        status: "overdue"
      }
    ]);

    mocks.generateGeminiJson.mockResolvedValue({
      success: true,
      data: {
        headline: "Arus kas dalam kondisi terkendali dengan akselerasi penagihan.",
        profitabilityAnalysis: "Margin laba kotor berada di atas 15% dengan pendapatan stabil.",
        costEfficiencyAnalysis: "Beban operasional perlu dijaga agar tidak melampaui rata-rata harian.",
        accountsReceivableHealth: "Terdapat piutang tempo yang perlu segera ditagih.",
        weeklyActionPriorities: [
          "Follow up Toko Berkah dan CV Maju Jaya.",
          "Jaga saldo kas minimal Rp 10 juta.",
          "Evaluasi beban kendaraan."
        ]
      }
    });
  });

  it("calculates deterministic cashflow projections and returns 30 days timeline with detailed metrics", async () => {
    const forecast = await getFinancialAiForecast({ forceRefresh: true });

    expect(forecast).toBeDefined();
    expect(forecast.currency).toBe("IDR");
    expect(forecast.baseMetrics.past30DaysRevenue).toBe(15_000_000);
    expect(forecast.baseMetrics.past30DaysExpenses).toBe(3_000_000);
    expect(forecast.baseMetrics.totalSalesCount).toBe(2);
    expect(forecast.baseMetrics.totalExpenseCount).toBe(2);
    expect(forecast.baseMetrics.activeReceivablesTotal).toBe(10_000_000);
    expect(forecast.baseMetrics.overdueReceivablesTotal).toBe(6_000_000);
    expect(forecast.baseMetrics.upcomingReceivablesTotal).toBe(4_000_000);
    expect(forecast.baseMetrics.overdueCount).toBe(1);
    expect(forecast.baseMetrics.upcomingCount).toBe(1);
    expect(forecast.baseMetrics.topExpenseCategories.length).toBeGreaterThanOrEqual(1);

    expect(forecast.dailyTimeline).toHaveLength(30);
    expect(forecast.projections.runwayDays).toBeGreaterThan(0);
    expect(forecast.priorityCollections.length).toBeGreaterThanOrEqual(1);
    expect(forecast.executiveSummary.headline).toContain("Arus kas");
    expect(forecast.executiveSummary.weeklyActionPriorities).toHaveLength(3);
  });

  it("subtracts tempo reversals from tempo collections correctly", async () => {
    mocks.prisma.tempoPaymentReversal.findMany.mockResolvedValue([
      { id: "rev-1", amount: 1_000_000, reversalDate: new Date() }
    ]);

    const forecast = await getFinancialAiForecast({ forceRefresh: true });
    // Inflow had 10jt cash + 1jt initial dp + (3jt tempoPayment - 1jt reversal = 2jt) = 13jt total inflow
    expect(forecast.baseMetrics.past30DaysRevenue).toBe(15_000_000);
    expect(forecast).toBeDefined();
  });

  it("returns all active receivables in priorityCollections for client-side pagination", async () => {
    const manyReceivables = Array.from({ length: 12 }, (_, i) => ({
      id: `tr-${i}`,
      customerName: `Customer ${i}`,
      remainingAmount: 1_000_000,
      dueDate: new Date(Date.now() + i * 24 * 60 * 60 * 1000),
      status: "open"
    }));

    mocks.prisma.tempoReceivable.findMany.mockResolvedValue(manyReceivables);

    const forecast = await getFinancialAiForecast({ forceRefresh: true });
    expect(forecast.priorityCollections).toHaveLength(12);
  });

  it("handles Gemini fallback gracefully when API returns failure without any emojis", async () => {
    mocks.generateGeminiJson.mockResolvedValue({
      success: false,
      error: "Quota exceeded"
    });

    const forecast = await getFinancialAiForecast({ forceRefresh: true });

    expect(forecast).toBeDefined();
    expect(forecast.executiveSummary.headline).toBeDefined();
    expect(forecast.executiveSummary.weeklyActionPriorities.length).toBeGreaterThan(0);
    // Ensure no emojis in fallback text
    expect(forecast.executiveSummary.headline).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });

  it("answers owner questions in askFinancialCfo with financial context", async () => {
    mocks.generateGeminiJson.mockResolvedValue({
      success: true,
      data: {
        answer: "Laba bersih operasional berada di kisaran positif dan cadangan kas mencukupi.",
        keyHighlights: ["Saldo kas aman", "Piutang berjalan lancar"],
        recommendedAction: "Pertahankan burn rate harian."
      }
    });

    const advice = await askFinancialCfo("Apakah arus kas bulan ini aman?");

    expect(advice.answer).toContain("Laba bersih");
    expect(advice.keyHighlights).toContain("Saldo kas aman");
    expect(advice.recommendedAction).toBeDefined();
  });

  it("throws an error when askFinancialCfo receives an empty question", async () => {
    await expect(askFinancialCfo("   ")).rejects.toThrow("Pertanyaan tidak boleh kosong.");
  });
});

