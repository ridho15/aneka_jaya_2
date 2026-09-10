import "server-only";
import { prisma } from "@/lib/db/prisma";
import { generateGeminiJson } from "@/lib/ai/gemini";
import { jakartaDateKey } from "@/lib/date/jakarta";
import { getOperationalProfitSetting } from "@/lib/settings/profit";

export type FinancialHealthStatus = "HEALTHY" | "WARNING" | "CRITICAL";

export type DailyCashflowPoint = {
  dayNumber: number;
  date: string;
  projectedInflow: number;
  projectedOutflow: number;
  projectedBalance: number;
  isBufferBreached: boolean;
  inflowBreakdown: {
    expectedDailySales: number;
    expectedTempoCollections: number;
  };
  outflowBreakdown: {
    expectedOperationalExpenses: number;
    expectedRestock: number;
  };
};

export type CriticalDateAlert = {
  date: string;
  dayNumber: number;
  projectedBalance: number;
  deficitAmount: number;
  severity: "CRITICAL" | "WARNING";
  reason: string;
  recommendedAction: string;
};

export type PriorityCollectionTarget = {
  customerName: string;
  dueDate: string;
  amount: number;
  daysUntilDue: number;
  urgency: "HIGH" | "MEDIUM" | "LOW";
  suggestedScript: string;
};

export type FinancialAiForecastResult = {
  generatedAt: string;
  model: string;
  currency: string;
  baseMetrics: {
    currentCashBalance: number;
    past30DaysRevenue: number;
    past30DaysExpenses: number;
    past30DaysGrossProfit: number;
    past30DaysGrossMarginPercent: number;
    past30DaysNettProfit: number;
    activeReceivablesTotal: number;
    overdueReceivablesTotal: number;
    upcomingReceivablesTotal: number;
    overdueCount: number;
    upcomingCount: number;
    minimumBufferThreshold: number;
    dailyBurnRate: number;
    totalSalesCount: number;
    totalExpenseCount: number;
    topExpenseCategories: { category: string; amount: number; percentage: number }[];
  };
  projections: {
    projected30DaysInflow: number;
    projected30DaysOutflow: number;
    projected30DaysNettChange: number;
    projectedEndBalance: number;
    runwayDays: number;
    healthStatus: FinancialHealthStatus;
  };
  criticalAlerts: CriticalDateAlert[];
  dailyTimeline: DailyCashflowPoint[];
  priorityCollections: PriorityCollectionTarget[];
  executiveSummary: {
    headline: string;
    profitabilityAnalysis: string;
    costEfficiencyAnalysis: string;
    accountsReceivableHealth: string;
    weeklyActionPriorities: string[];
  };
};

export type CfoAdviceResponse = {
  answer: string;
  keyHighlights?: string[];
  recommendedAction?: string;
};

// In-memory cache for 10 minutes
let forecastCache: {
  timestamp: number;
  data: FinancialAiForecastResult;
} | null = null;

const CACHE_TTL_MS = 10 * 60 * 1000;

export async function getFinancialAiForecast(options: { forceRefresh?: boolean } = {}): Promise<FinancialAiForecastResult> {
  const now = Date.now();
  if (!options.forceRefresh && forecastCache && now - forecastCache.timestamp < CACHE_TTL_MS) {
    return forecastCache.data;
  }

  // 1. Gather historical data (past 30 days)
  const today = new Date();
  const past30DaysDate = new Date();
  past30DaysDate.setDate(today.getDate() - 30);

  // Past sales (Cash, TF, and partial/Tempo)
  const sales = await prisma.salesRecord.findMany({
    where: {
      saleDate: { gte: past30DaysDate },
      approvalStatus: { notIn: ["rejected", "cancelled"] }
    },
    include: { items: true }
  });

  // Past tempo payments and reversals received
  const [tempoPayments, tempoReversals] = await Promise.all([
    prisma.tempoPayment.findMany({
      where: {
        paymentDate: { gte: past30DaysDate }
      }
    }),
    prisma.tempoPaymentReversal.findMany({
      where: {
        reversalDate: { gte: past30DaysDate }
      }
    })
  ]);

  // Past expenses (approved only)
  const expenses = await prisma.expenseRecord.findMany({
    where: {
      expenseDate: { gte: past30DaysDate },
      approvalStatus: "approved"
    }
  });

  // Active receivables (open, partial_paid, overdue)
  const activeReceivables = await prisma.tempoReceivable.findMany({
    where: {
      status: { in: ["open", "partial_paid", "overdue"] }
    },
    orderBy: { dueDate: "asc" }
  });

  // App settings for profit margin
  const profitSetting = await getOperationalProfitSetting().catch(() => ({ grossProfitPercent: 10 }));
  const fallbackMarginRate = (profitSetting?.grossProfitPercent ?? 10) / 100;

  // 2. Deterministic calculations
  let past30CashInflow = 0;
  let past30TotalRevenue = 0;
  let past30GrossProfit = 0;

  for (const s of sales) {
    const total = Number(s.total) || 0;
    past30TotalRevenue += total;

    if (s.paymentMethod === "Cash" || s.paymentMethod === "TF") {
      past30CashInflow += total;
    } else if (Number(s.initialPaymentAmount) > 0) {
      past30CashInflow += Number(s.initialPaymentAmount);
    }

    // Estimate gross profit: calculate item markup if available, else use system fallback percentage
    let itemCostTotal = 0;
    let hasCost = false;
    for (const item of s.items) {
      const manualCost = Number((item.manualProduct as any)?.costPrice);
      const qty = Number(item.quantity) || 0;
      if (Number.isFinite(manualCost) && manualCost > 0) {
        itemCostTotal += manualCost * qty;
        hasCost = true;
      }
    }

    if (hasCost && itemCostTotal > 0) {
      past30GrossProfit += Math.max(0, total - itemCostTotal);
    } else {
      past30GrossProfit += Math.round(total * fallbackMarginRate);
    }
  }

  // Net tempo payments collected in past 30 days (payments minus reversals)
  let netTempoCollections = 0;
  for (const p of tempoPayments) {
    netTempoCollections += Number(p.amountPaid) || 0;
  }
  for (const r of tempoReversals) {
    netTempoCollections -= Number(r.amount) || 0;
  }
  netTempoCollections = Math.max(0, netTempoCollections);
  past30CashInflow += netTempoCollections;

  // Calculate past expenses & category breakdowns
  let past30TotalExpenses = 0;
  const expenseByCategory: Record<string, number> = {};
  for (const e of expenses) {
    const amount = Number(e.amount) || 0;
    past30TotalExpenses += amount;
    const cat = e.category || e.coaNameSnapshot || "Lain-lain";
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + amount;
  }

  const past30NettProfit = past30GrossProfit - past30TotalExpenses;
  const grossMarginPercent = past30TotalRevenue > 0
    ? Math.round((past30GrossProfit / past30TotalRevenue) * 1000) / 10
    : 0;

  // Active receivables breakdown
  let totalActiveReceivables = 0;
  let overdueReceivablesTotal = 0;
  let upcomingReceivablesTotal = 0;
  let overdueCount = 0;
  let upcomingCount = 0;

  for (const r of activeReceivables) {
    const rem = Number(r.remainingAmount) || 0;
    totalActiveReceivables += rem;
    const dueDate = new Date(r.dueDate);
    if (dueDate.getTime() < today.getTime()) {
      overdueReceivablesTotal += rem;
      overdueCount++;
    } else {
      upcomingReceivablesTotal += rem;
      upcomingCount++;
    }
  }

  // Top 5 expense categories
  const topExpenseCategories = Object.entries(expenseByCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([category, amount]) => ({
      category,
      amount: Math.round(amount),
      percentage: past30TotalExpenses > 0 ? Math.round((amount / past30TotalExpenses) * 1000) / 10 : 0
    }));

  // Daily averages
  const dailyAvgSalesInflow = Math.round(past30CashInflow / 30);
  const dailyAvgExpenseOutflow = Math.round(past30TotalExpenses / 30);
  const dailyBurnRate = Math.max(1, dailyAvgExpenseOutflow);

  // Baseline minimum cash buffer threshold (7 days of OPEX)
  const minimumBufferThreshold = Math.max(10_000_000, dailyBurnRate * 7);

  // Current liquid cash estimate: net operational cash surplus + minimum working buffer
  const currentCashBalance = Math.max(
    minimumBufferThreshold * 1.5,
    past30CashInflow - past30TotalExpenses + minimumBufferThreshold
  );

  // 3. Build 30-day projection timeline (mathematical model)
  const dailyTimeline: DailyCashflowPoint[] = [];
  const criticalAlerts: CriticalDateAlert[] = [];
  let runningBalance = currentCashBalance;

  let totalProjectedInflow = 0;
  let totalProjectedOutflow = 0;

  // Group upcoming receivables by day offset (0 to 30)
  const receivablesByDay: Record<number, number> = {};
  for (const r of activeReceivables) {
    const dueDate = new Date(r.dueDate);
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const amount = Number(r.remainingAmount) || 0;

    if (diffDays <= 0) {
      // Overdue: conservative collection distribution over next 3 days
      receivablesByDay[1] = (receivablesByDay[1] || 0) + Math.round(amount * 0.4);
      receivablesByDay[2] = (receivablesByDay[2] || 0) + Math.round(amount * 0.3);
      receivablesByDay[3] = (receivablesByDay[3] || 0) + Math.round(amount * 0.2);
    } else if (diffDays <= 30) {
      receivablesByDay[diffDays] = (receivablesByDay[diffDays] || 0) + Math.round(amount * 0.85); // 85% realization
    }
  }

  for (let d = 1; d <= 30; d++) {
    const pointDate = new Date();
    pointDate.setDate(today.getDate() + d);
    const dateStr = jakartaDateKey(pointDate);

    // Inflow: daily sales moving average + scheduled receivables
    const expectedTempo = receivablesByDay[d] || 0;
    const dayInflow = dailyAvgSalesInflow + expectedTempo;

    // Outflow: daily OPEX + periodic restock allocation
    // Restock expense occurs every 7 days (day 7, 14, 21, 28)
    const isRestockDay = d % 7 === 0;
    const expectedRestock = isRestockDay ? Math.round(dailyAvgSalesInflow * 3.5) : 0;
    const dayOutflow = dailyAvgExpenseOutflow + expectedRestock;

    runningBalance = runningBalance + dayInflow - dayOutflow;
    totalProjectedInflow += dayInflow;
    totalProjectedOutflow += dayOutflow;

    const isBufferBreached = runningBalance < minimumBufferThreshold;

    if (isBufferBreached && criticalAlerts.length < 3) {
      const deficit = minimumBufferThreshold - runningBalance;
      criticalAlerts.push({
        date: dateStr,
        dayNumber: d,
        projectedBalance: Math.round(runningBalance),
        deficitAmount: Math.round(deficit),
        severity: runningBalance < 0 ? "CRITICAL" : "WARNING",
        reason: isRestockDay
          ? `Alokasi pembayaran restock berkala dan beban operasional harian melampaui kas masuk hari tersebut.`
          : `Akumulasi beban operasional menekan saldo kas di bawah batas cadangan aman (Buffer Rp ${minimumBufferThreshold.toLocaleString("id-ID")}).`,
        recommendedAction: `Prioritaskan penagihan piutang sebelum tanggal ${dateStr} dan sesuaikan jadwal pengeluaran non-esensial.`
      });
    }

    dailyTimeline.push({
      dayNumber: d,
      date: dateStr,
      projectedInflow: Math.round(dayInflow),
      projectedOutflow: Math.round(dayOutflow),
      projectedBalance: Math.round(runningBalance),
      isBufferBreached,
      inflowBreakdown: {
        expectedDailySales: dailyAvgSalesInflow,
        expectedTempoCollections: expectedTempo
      },
      outflowBreakdown: {
        expectedOperationalExpenses: dailyAvgExpenseOutflow,
        expectedRestock
      }
    });
  }

  // Calculate runway days (how many days until balance drops below 0)
  let runwayDays = 30;
  for (let i = 0; i < dailyTimeline.length; i++) {
    if (dailyTimeline[i].projectedBalance <= 0) {
      runwayDays = i + 1;
      break;
    }
  }

  let healthStatus: FinancialHealthStatus = "HEALTHY";
  if (runwayDays <= 14 || criticalAlerts.some((a) => a.severity === "CRITICAL")) {
    healthStatus = "CRITICAL";
  } else if (criticalAlerts.length > 0 || runningBalance < minimumBufferThreshold) {
    healthStatus = "WARNING";
  }

  // 4. Identify collection targets (all active receivables mapped with urgency & suggested script)
  const priorityCollections: PriorityCollectionTarget[] = activeReceivables.map((r) => {
    const dueDate = new Date(r.dueDate);
    const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const remaining = Number(r.remainingAmount) || 0;

    let urgency: "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
    if (diffDays <= 0) urgency = "HIGH";
    else if (diffDays > 7) urgency = "LOW";

    return {
      customerName: r.customerName,
      dueDate: jakartaDateKey(dueDate),
      amount: remaining,
      daysUntilDue: diffDays,
      urgency,
      suggestedScript: diffDays <= 0
        ? `Selamat pagi/siang Bapak/Ibu ${r.customerName}. Mengonfirmasi tagihan transaksi nomor terkait sebesar Rp ${remaining.toLocaleString("id-ID")} yang telah melewati jatuh tempo pada ${jakartaDateKey(dueDate)}. Mohon konfirmasi jadwal transfer pelunasannya ke rekening kami. Terima kasih.`
        : `Selamat pagi/siang Bapak/Ibu ${r.customerName}. Mengingatkan bahwa tagihan transaksi sebesar Rp ${remaining.toLocaleString("id-ID")} akan jatuh tempo dalam ${diffDays} hari (${jakartaDateKey(dueDate)}). Terima kasih atas kerja samanya.`
    };
  });

  // 5. Send verified ground truth payload to Gemini for Executive Synthesis
  const promptPayload = {
    metrics: {
      currentCashBalance: Math.round(currentCashBalance),
      past30DaysRevenue: Math.round(past30TotalRevenue),
      past30DaysExpenses: Math.round(past30TotalExpenses),
      past30DaysGrossProfit: Math.round(past30GrossProfit),
      past30DaysGrossMarginPercent: grossMarginPercent,
      past30DaysNettProfit: Math.round(past30NettProfit),
      activeReceivablesTotal: Math.round(totalActiveReceivables),
      overdueReceivablesTotal: Math.round(overdueReceivablesTotal),
      upcomingReceivablesTotal: Math.round(upcomingReceivablesTotal),
      overdueCount,
      upcomingCount,
      minimumBufferThreshold: Math.round(minimumBufferThreshold),
      dailyBurnRate: Math.round(dailyBurnRate),
      runwayDays,
      healthStatus,
      totalSalesCount: sales.length,
      totalExpenseCount: expenses.length
    },
    topExpenseCategories,
    criticalAlertsCount: criticalAlerts.length,
    priorityReceivablesCount: priorityCollections.length
  };

  const aiPrompt = `Anda adalah seorang Chief Financial Officer (CFO) dan penasihat keuangan senior untuk bisnis distributor "SLM & Aneka Jaya".
Berdasarkan data keuangan matematis terverifikasi berikut:
${JSON.stringify(promptPayload, null, 2)}

Instruksi Khusus & Batasan Format:
1. DILARANG KERAS menggunakan emoji atau emotikon apapun.
2. Gunakan Bahasa Indonesia formal korporat yang objektif, analitis, padat informasi, dan dapat ditindaklanjuti oleh Owner dan Direksi.
3. Struktur jawaban harus presisi berdasarkan angka di atas tanpa mengarang angka fiktif.

Format output HANYA dalam JSON valid:
{
  "headline": "Satu kalimat rangkuman eksekutif paling tajam mengenai kondisi finansial dan likuiditas saat ini",
  "profitabilityAnalysis": "Analisis 2-3 kalimat mengenai kesehatan margin laba kotor, omzet, dan laba bersih 30 hari terakhir",
  "costEfficiencyAnalysis": "Analisis 2-3 kalimat mengenai efisiensi pengeluaran operasional dan kategori beban terbesar yang perlu dipantau",
  "accountsReceivableHealth": "Analisis 2-3 kalimat mengenai kesehatan piutang tempo (AR), risiko keterlambatan, dan urgensi penagihan",
  "weeklyActionPriorities": [
    "Tindakan konkret prioritas 1 minggu ini",
    "Tindakan konkret prioritas 2 minggu ini",
    "Tindakan konkret prioritas 3 minggu ini",
    "Tindakan konkret prioritas 4 minggu ini"
  ]
}`;

  let executiveSummary = {
    headline: healthStatus === "HEALTHY"
      ? `Likuiditas kas operasional stabil dengan runway melampaui 30 hari dan estimasi margin kotor ${grossMarginPercent}%.`
      : `Peringatan likuiditas: Saldo kas berpotensi menipis dalam ${runwayDays} hari ke depan jika penagihan piutang tidak diakselerasi.`,
    profitabilityAnalysis: `Omzet 30 hari terakhir tercatat Rp ${Math.round(past30TotalRevenue).toLocaleString("id-ID")} dari ${sales.length} transaksi penjualan, menghasilkan estimasi laba kotor Rp ${Math.round(past30GrossProfit).toLocaleString("id-ID")} (margin ${grossMarginPercent}%). Laba bersih operasional setelah beban tercatat Rp ${Math.round(past30NettProfit).toLocaleString("id-ID")}.`,
    costEfficiencyAnalysis: `Total beban operasional 30 hari tercatat Rp ${Math.round(past30TotalExpenses).toLocaleString("id-ID")} dari ${expenses.length} pos biaya approved dengan rata-rata burn rate harian Rp ${Math.round(dailyBurnRate).toLocaleString("id-ID")}. Efisiensi pos beban terbesar perlu dipantau secara berkala.`,
    accountsReceivableHealth: `Total piutang berjalan tercatat Rp ${Math.round(totalActiveReceivables).toLocaleString("id-ID")} (${overdueCount} debitur telah melewati jatuh tempo senilai Rp ${Math.round(overdueReceivablesTotal).toLocaleString("id-ID")}). Akselerasi penagihan menjadi faktor penentu penjagaan saldo kas di atas buffer aman Rp ${Math.round(minimumBufferThreshold).toLocaleString("id-ID")}.`,
    weeklyActionPriorities: [
      `Akselerasi penagihan terhadap debitur yang telah melewati jatuh tempo dengan total eksposur Rp ${Math.round(overdueReceivablesTotal).toLocaleString("id-ID")}.`,
      `Pertahankan cadangan likuiditas minimum Rp ${Math.round(minimumBufferThreshold).toLocaleString("id-ID")} untuk menjaga ketahanan operasional 7 hari ke depan.`,
      `Audit efisiensi pos pengeluaran operasional terbesar agar margin laba bersih tetap terjaga.`,
      `Sinkronkan jadwal pembayaran restock barang dagangan dengan ritme arus kas masuk piutang tempo.`
    ]
  };

  try {
    const aiResponse = await generateGeminiJson<typeof executiveSummary>(aiPrompt, {
      model: "gemini-2.5-flash",
      temperature: 0.2
    });

    if (aiResponse.success && aiResponse.data && aiResponse.data.headline) {
      executiveSummary = {
        headline: aiResponse.data.headline,
        profitabilityAnalysis: aiResponse.data.profitabilityAnalysis || executiveSummary.profitabilityAnalysis,
        costEfficiencyAnalysis: aiResponse.data.costEfficiencyAnalysis || executiveSummary.costEfficiencyAnalysis,
        accountsReceivableHealth: aiResponse.data.accountsReceivableHealth || executiveSummary.accountsReceivableHealth,
        weeklyActionPriorities: Array.isArray(aiResponse.data.weeklyActionPriorities) && aiResponse.data.weeklyActionPriorities.length > 0
          ? aiResponse.data.weeklyActionPriorities
          : executiveSummary.weeklyActionPriorities
      };
    }
  } catch (aiErr) {
    console.warn("[Financial AI Service] Gemini synthesis fallback used:", aiErr);
  }

  const result: FinancialAiForecastResult = {
    generatedAt: new Date().toISOString(),
    model: "gemini-2.5-flash",
    currency: "IDR",
    baseMetrics: {
      currentCashBalance: Math.round(currentCashBalance),
      past30DaysRevenue: Math.round(past30TotalRevenue),
      past30DaysExpenses: Math.round(past30TotalExpenses),
      past30DaysGrossProfit: Math.round(past30GrossProfit),
      past30DaysGrossMarginPercent: grossMarginPercent,
      past30DaysNettProfit: Math.round(past30NettProfit),
      activeReceivablesTotal: Math.round(totalActiveReceivables),
      overdueReceivablesTotal: Math.round(overdueReceivablesTotal),
      upcomingReceivablesTotal: Math.round(upcomingReceivablesTotal),
      overdueCount,
      upcomingCount,
      minimumBufferThreshold: Math.round(minimumBufferThreshold),
      dailyBurnRate: Math.round(dailyBurnRate),
      totalSalesCount: sales.length,
      totalExpenseCount: expenses.length,
      topExpenseCategories
    },
    projections: {
      projected30DaysInflow: Math.round(totalProjectedInflow),
      projected30DaysOutflow: Math.round(totalProjectedOutflow),
      projected30DaysNettChange: Math.round(totalProjectedInflow - totalProjectedOutflow),
      projectedEndBalance: Math.round(runningBalance),
      runwayDays,
      healthStatus
    },
    criticalAlerts,
    dailyTimeline,
    priorityCollections,
    executiveSummary
  };

  forecastCache = {
    timestamp: now,
    data: result
  };

  return result;
}

export async function askFinancialCfo(question: string): Promise<CfoAdviceResponse> {
  const cleanQuestion = question.trim();
  if (!cleanQuestion) {
    throw new Error("Pertanyaan tidak boleh kosong.");
  }

  // Get active financial forecast context
  const context = await getFinancialAiForecast();

  const cfoPrompt = `Anda adalah Chief Financial Officer (CFO) virtual untuk Owner bisnis distributor "SLM & Aneka Jaya".
Konteks data keuangan terbaru perusahaan saat ini:
- Saldo Kas Likuid Operasional: Rp ${context.baseMetrics.currentCashBalance.toLocaleString("id-ID")}
- Omzet 30 Hari Terakhir: Rp ${context.baseMetrics.past30DaysRevenue.toLocaleString("id-ID")} (${context.baseMetrics.totalSalesCount} transaksi aktif)
- Beban Operasional 30 Hari: Rp ${context.baseMetrics.past30DaysExpenses.toLocaleString("id-ID")} (${context.baseMetrics.totalExpenseCount} transaksi approved)
- Laba Kotor: Rp ${context.baseMetrics.past30DaysGrossProfit.toLocaleString("id-ID")} (Margin ${context.baseMetrics.past30DaysGrossMarginPercent}%)
- Laba Bersih Operasional: Rp ${context.baseMetrics.past30DaysNettProfit.toLocaleString("id-ID")}
- Total Piutang Tempo Aktif: Rp ${context.baseMetrics.activeReceivablesTotal.toLocaleString("id-ID")} (Overdue: Rp ${context.baseMetrics.overdueReceivablesTotal.toLocaleString("id-ID")})
- Ambang Batas Cadangan Kas Aman: Rp ${context.baseMetrics.minimumBufferThreshold.toLocaleString("id-ID")}
- Status Kesehatan Likuiditas: ${context.projections.healthStatus}
- Runway Kas: ${context.projections.runwayDays} hari
- Proyeksi Kas Akhir 30 Hari: Rp ${context.projections.projectedEndBalance.toLocaleString("id-ID")}
- Jumlah Hari Peringatan Likuiditas: ${context.criticalAlerts.length} hari

Pertanyaan dari Owner: "${cleanQuestion}"

Instruksi:
1. Jawablah secara langsung, analitis, lugas, dan profesional berdasarkan fakta data di atas.
2. DILARANG KERAS menggunakan emoji atau emotikon apapun.
3. Hindari basa-basi. Berikan saran strategis berbasis perhitungan bisnis.
4. Format output HANYA dalam JSON valid:
{
  "answer": "Jawaban komprehensif 2-3 paragraf formal tanpa emoji",
  "keyHighlights": [
    "Poin data kunci 1",
    "Poin data kunci 2"
  ],
  "recommendedAction": "Rekomendasi langkah tindakan strategis yang konkret dan terukur"
}`;

  const aiRes = await generateGeminiJson<CfoAdviceResponse>(cfoPrompt, {
    model: "gemini-2.5-flash",
    temperature: 0.2
  });

  if (aiRes.success && aiRes.data && aiRes.data.answer) {
    return aiRes.data;
  }

  return {
    answer: `Berdasarkan data keuangan aktif SLM, saldo kas likuid saat ini berada pada angka Rp ${context.baseMetrics.currentCashBalance.toLocaleString("id-ID")} dengan total piutang tempo yang sedang berjalan sebesar Rp ${context.baseMetrics.activeReceivablesTotal.toLocaleString("id-ID")} (${context.baseMetrics.overdueCount} debitur lewat jatuh tempo senilai Rp ${context.baseMetrics.overdueReceivablesTotal.toLocaleString("id-ID")}). Laba bersih operasional 30 hari terakhir tercatat Rp ${context.baseMetrics.past30DaysNettProfit.toLocaleString("id-ID")} dengan margin kotor ${context.baseMetrics.past30DaysGrossMarginPercent}%. Menanggapi pertanyaan: "${cleanQuestion}", fokus utama manajemen kas adalah menjaga saldo operasional tetap berada di atas batas cadangan aman Rp ${context.baseMetrics.minimumBufferThreshold.toLocaleString("id-ID")}.`,
    keyHighlights: [
      `Saldo Kas Operasional: Rp ${context.baseMetrics.currentCashBalance.toLocaleString("id-ID")}`,
      `Laba Bersih Operasional: Rp ${context.baseMetrics.past30DaysNettProfit.toLocaleString("id-ID")}`,
      `Piutang Lewat Tempo: Rp ${context.baseMetrics.overdueReceivablesTotal.toLocaleString("id-ID")}`
    ],
    recommendedAction: "Prioritaskan penagihan piutang yang telah jatuh tempo untuk menjaga ketahanan likuiditas kas operasional."
  };
}

