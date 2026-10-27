"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import type { FinancialAiForecastResult, CfoAdviceResponse } from "@/lib/ai/financialAiService";

type Props = {
  initialData: FinancialAiForecastResult;
};

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);

const shortRupiah = (value: number) => {
  if (Math.abs(value) >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(1)} M`;
  if (Math.abs(value) >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(1)} Jt`;
  if (Math.abs(value) >= 1_000) return `Rp ${(value / 1_000).toFixed(0)} Rb`;
  return `Rp ${value}`;
};

type ChatMessage = {
  sender: "user" | "cfo";
  text: string;
  highlights?: string[];
  action?: string;
  timestamp: string;
};

/* Vector SVG Icons (Clean, Minimalist, Zero Emoji) */
function IconRefresh({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function IconCheck({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function IconCopy({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function IconShieldAlert({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function IconArrowNarrowRight({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}

function IconSearch({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function IconX({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconChevronLeft({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function IconChevronRight({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function IconChartArea({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    </svg>
  );
}

function IconChartBar({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

export function AiFinancialForecastView({ initialData }: Props) {
  const [data, setData] = useState<FinancialAiForecastResult>(initialData);
  const [activeTab, setActiveTab] = useState<"cashflow" | "briefing" | "ask">("cashflow");
  const [chartMode, setChartMode] = useState<"curve" | "bars">("curve");
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  // Debtor List State: Search, Filter, Sort, Pagination
  const [debtorSearch, setDebtorSearch] = useState("");
  const [debtorFilter, setDebtorFilter] = useState<"ALL" | "OVERDUE" | "UPCOMING_7" | "UPCOMING_LATER">("ALL");
  const [debtorSort, setDebtorSort] = useState<"DUE_ASC" | "AMOUNT_DESC" | "NAME_ASC">("DUE_ASC");
  const [debtorPage, setDebtorPage] = useState(1);
  const [debtorPageSize, setDebtorPageSize] = useState(6);

  // Timeline Table State: Search, Filter Condition, Filter Week, Pagination
  const [timelineSearch, setTimelineSearch] = useState("");
  const [timelineFilterCondition, setTimelineFilterCondition] = useState<"ALL" | "BUFFER_BREACH" | "TEMPO_INFLOW" | "RESTOCK_OUTFLOW">("ALL");
  const [timelineFilterWeek, setTimelineFilterWeek] = useState<"ALL" | "W1" | "W2" | "W3" | "W4">("ALL");
  const [timelinePage, setTimelinePage] = useState(1);
  const [timelinePageSize, setTimelinePageSize] = useState(10);

  // Chat Q&A State
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      sender: "cfo",
      text: `Sistem Analisis CFO Finansial aktif. Posisi kas likuid operasional tercatat ${rupiah(data.baseMetrics.currentCashBalance)} dengan proyeksi ketahanan kas (runway) ${data.projections.runwayDays} hari. Silakan ajukan pertanyaan seputar analisis likuiditas, efisiensi beban operasional, perputaran piutang tempo, maupun simulasi belanja modal.`,
      timestamp: "Sesi Aktif"
    }
  ]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/finance-forecast?force=true");
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } catch (err) {
      console.error("Gagal memperbarui analisis keuangan:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAskCfo = async (customText?: string) => {
    const query = (customText || question).trim();
    if (!query || asking) return;

    const userMsg: ChatMessage = {
      sender: "user",
      text: query,
      timestamp: new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date())
    };

    setChatHistory((prev) => [...prev, userMsg]);
    setQuestion("");
    setAsking(true);

    try {
      const res = await fetch("/api/ai/finance-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query })
      });
      const json = await res.json();
      if (json.success && json.data) {
        const advice = json.data as CfoAdviceResponse;
        const cfoMsg: ChatMessage = {
          sender: "cfo",
          text: advice.answer,
          highlights: advice.keyHighlights,
          action: advice.recommendedAction,
          timestamp: new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date())
        };
        setChatHistory((prev) => [...prev, cfoMsg]);
      } else {
        setChatHistory((prev) => [
          ...prev,
          {
            sender: "cfo",
            text: json.message || "Kendala teknis terjadi saat memproses analisis keuangan.",
            timestamp: "Sistem"
          }
        ]);
      }
    } catch {
      setChatHistory((prev) => [
        ...prev,
        {
          sender: "cfo",
          text: "Gagal terhubung ke modul AI CFO. Periksa koneksi jaringan server.",
          timestamp: "Sistem"
        }
      ]);
    } finally {
      setAsking(false);
    }
  };

  const handleCopyScript = (script: string, index: number) => {
    navigator.clipboard.writeText(script);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2500);
  };

  const quickQuestions = [
    "Evaluasi kesehatan margin kotor dan laba bersih operasional 30 hari terakhir",
    "Analisis pos beban operasional terbesar dan potensi efisiensi biaya",
    "Daftar debitur dengan risiko keterlambatan tertinggi yang harus segera ditagih",
    "Simulasi kelayakan penambahan belanja persediaan stok senilai Rp 50.000.000"
  ];

  const statusBadge = () => {
    switch (data.projections.healthStatus) {
      case "HEALTHY":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Likuiditas Terkendali
          </span>
        );
      case "WARNING":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Perhatian Likuiditas
          </span>
        );
      case "CRITICAL":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-300">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            Defisit / Risiko Kas
          </span>
        );
    }
  };

  // Calculate high-signal ratios
  const opexToRevenueRatio = data.baseMetrics.past30DaysRevenue > 0
    ? Math.round((data.baseMetrics.past30DaysExpenses / data.baseMetrics.past30DaysRevenue) * 1000) / 10
    : 0;

  const overdueRatio = data.baseMetrics.activeReceivablesTotal > 0
    ? Math.round((data.baseMetrics.overdueReceivablesTotal / data.baseMetrics.activeReceivablesTotal) * 1000) / 10
    : 0;

  // Curve calculation metrics & points
  const minProjectedBalance = useMemo(() => {
    return Math.min(...data.dailyTimeline.map((d) => d.projectedBalance));
  }, [data.dailyTimeline]);

  const maxProjectedBalance = useMemo(() => {
    return Math.max(...data.dailyTimeline.map((d) => d.projectedBalance));
  }, [data.dailyTimeline]);

  const lowestBalancePoint = useMemo(() => {
    return data.dailyTimeline.reduce((lowest, current) =>
      current.projectedBalance < lowest.projectedBalance ? current : lowest
    , data.dailyTimeline[0]);
  }, [data.dailyTimeline]);

  const highestBalancePoint = useMemo(() => {
    return data.dailyTimeline.reduce((highest, current) =>
      current.projectedBalance > highest.projectedBalance ? current : highest
    , data.dailyTimeline[0]);
  }, [data.dailyTimeline]);

  const activeSelectedDay = useMemo(() => {
    if (hoveredDay !== null) {
      return data.dailyTimeline.find((d) => d.dayNumber === hoveredDay) || data.dailyTimeline[0];
    }
    return lowestBalancePoint || data.dailyTimeline[0];
  }, [hoveredDay, data.dailyTimeline, lowestBalancePoint]);

  // SVG Curve Coordinate Setup
  const padLeft = 72;
  const padRight = 24;
  const padTop = 24;
  const padBottom = 38;
  const plotW = 900 - padLeft - padRight; // 804
  const plotH = 240 - padTop - padBottom; // 178

  const rawMin = Math.min(minProjectedBalance, data.baseMetrics.minimumBufferThreshold);
  const rawMax = Math.max(maxProjectedBalance, data.baseMetrics.minimumBufferThreshold);
  const span = Math.max(1_000_000, rawMax - rawMin);
  const yMin = Math.max(0, Math.floor((rawMin - span * 0.12) / 1_000_000) * 1_000_000);
  const yMax = Math.ceil((rawMax + span * 0.15) / 1_000_000) * 1_000_000;
  const ySpan = yMax - yMin || 1;

  const getCurveX = (index: number) =>
    padLeft + (index / (data.dailyTimeline.length - 1 || 1)) * plotW;
  const getCurveY = (val: number) =>
    padTop + plotH - ((val - yMin) / ySpan) * plotH;

  const yBuffer = getCurveY(data.baseMetrics.minimumBufferThreshold);

  const curvePoints = useMemo(() => {
    return data.dailyTimeline.map((d, i) => ({
      x: getCurveX(i),
      y: getCurveY(d.projectedBalance),
      ...d
    }));
  }, [data.dailyTimeline, yMin, ySpan]);

  const curveLinePath = useMemo(() => {
    if (curvePoints.length === 0) return "";
    if (curvePoints.length === 1) return `M ${curvePoints[0].x} ${curvePoints[0].y}`;

    let path = `M ${curvePoints[0].x.toFixed(1)} ${curvePoints[0].y.toFixed(1)}`;
    for (let i = 0; i < curvePoints.length - 1; i++) {
      const p0 = curvePoints[i === 0 ? i : i - 1];
      const p1 = curvePoints[i];
      const p2 = curvePoints[i + 1];
      const p3 = curvePoints[i + 2 < curvePoints.length ? i + 2 : i + 1];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return path;
  }, [curvePoints]);

  const curveAreaPath = useMemo(() => {
    if (!curveLinePath || curvePoints.length === 0) return "";
    const lastPt = curvePoints[curvePoints.length - 1];
    const firstPt = curvePoints[0];
    const bottomY = padTop + plotH;
    return `${curveLinePath} L ${lastPt.x.toFixed(1)} ${bottomY.toFixed(1)} L ${firstPt.x.toFixed(1)} ${bottomY.toFixed(1)} Z`;
  }, [curveLinePath, curvePoints]);

  const yGridValues = useMemo(() => [
    yMax,
    yMin + (ySpan * 3) / 4,
    yMin + (ySpan * 2) / 4,
    yMin + ySpan / 4,
    yMin
  ], [yMax, yMin, ySpan]);

  // Max value for visual bar chart
  const maxTimelineFlow = Math.max(
    ...data.dailyTimeline.map((d) => Math.max(d.projectedInflow, d.projectedOutflow)),
    1_000_000
  );

  // Debtor filter counts
  const overdueDebtorCount = useMemo(
    () => data.priorityCollections.filter((d) => d.daysUntilDue <= 0).length,
    [data.priorityCollections]
  );
  const upcoming7DebtorCount = useMemo(
    () => data.priorityCollections.filter((d) => d.daysUntilDue > 0 && d.daysUntilDue <= 7).length,
    [data.priorityCollections]
  );

  // Debtor filtered and paginated list
  const filteredDebtors = useMemo(() => {
    return data.priorityCollections
      .filter((d) => {
        if (debtorSearch.trim()) {
          const q = debtorSearch.toLowerCase();
          if (!d.customerName.toLowerCase().includes(q)) return false;
        }
        if (debtorFilter === "OVERDUE") return d.daysUntilDue <= 0;
        if (debtorFilter === "UPCOMING_7") return d.daysUntilDue > 0 && d.daysUntilDue <= 7;
        if (debtorFilter === "UPCOMING_LATER") return d.daysUntilDue > 7;
        return true;
      })
      .sort((a, b) => {
        if (debtorSort === "AMOUNT_DESC") return b.amount - a.amount;
        if (debtorSort === "NAME_ASC") return a.customerName.localeCompare(b.customerName);
        return a.daysUntilDue - b.daysUntilDue;
      });
  }, [data.priorityCollections, debtorSearch, debtorFilter, debtorSort]);

  const totalDebtorPages = Math.max(1, Math.ceil(filteredDebtors.length / debtorPageSize));
  const paginatedDebtors = useMemo(() => {
    const start = (debtorPage - 1) * debtorPageSize;
    return filteredDebtors.slice(start, start + debtorPageSize);
  }, [filteredDebtors, debtorPage, debtorPageSize]);

  // Timeline filter counts
  const breachDayCount = useMemo(
    () => data.dailyTimeline.filter((d) => d.isBufferBreached).length,
    [data.dailyTimeline]
  );
  const tempoInflowDayCount = useMemo(
    () => data.dailyTimeline.filter((d) => d.inflowBreakdown.expectedTempoCollections > 0).length,
    [data.dailyTimeline]
  );
  const restockDayCount = useMemo(
    () => data.dailyTimeline.filter((d) => d.outflowBreakdown.expectedRestock > 0).length,
    [data.dailyTimeline]
  );

  // Timeline filtered and paginated list
  const filteredTimeline = useMemo(() => {
    return data.dailyTimeline.filter((row) => {
      if (timelineSearch.trim()) {
        const q = timelineSearch.toLowerCase().replace(/\s+/g, "");
        const dayLabel = `h+${row.dayNumber}`.toLowerCase();
        if (!row.date.toLowerCase().includes(q) && !dayLabel.includes(q)) {
          return false;
        }
      }
      if (timelineFilterCondition === "BUFFER_BREACH" && !row.isBufferBreached) return false;
      if (timelineFilterCondition === "TEMPO_INFLOW" && row.inflowBreakdown.expectedTempoCollections <= 0) return false;
      if (timelineFilterCondition === "RESTOCK_OUTFLOW" && row.outflowBreakdown.expectedRestock <= 0) return false;

      if (timelineFilterWeek === "W1" && (row.dayNumber < 1 || row.dayNumber > 7)) return false;
      if (timelineFilterWeek === "W2" && (row.dayNumber < 8 || row.dayNumber > 14)) return false;
      if (timelineFilterWeek === "W3" && (row.dayNumber < 15 || row.dayNumber > 21)) return false;
      if (timelineFilterWeek === "W4" && row.dayNumber < 22) return false;

      return true;
    });
  }, [data.dailyTimeline, timelineSearch, timelineFilterCondition, timelineFilterWeek]);

  const totalTimelinePages = Math.max(1, Math.ceil(filteredTimeline.length / timelinePageSize));
  const paginatedTimeline = useMemo(() => {
    const start = (timelinePage - 1) * timelinePageSize;
    return filteredTimeline.slice(start, start + timelinePageSize);
  }, [filteredTimeline, timelinePage, timelinePageSize]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner - Institutional Corporate Style */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                Intelligence Keuangan &amp; Arus Kas (AI CFO)
              </h1>
              {statusBadge()}
            </div>
            <p className="mt-1.5 text-xs text-slate-500 sm:text-sm">
              Model proyeksi likuiditas 30 hari, audit kesehatan margin operasional, dan konsultasi interaktif berbasis data riil PostgreSQL SLM.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
              <span>Dasar Data: {data.baseMetrics.totalSalesCount} nota penjualan aktif &bull; {data.baseMetrics.totalExpenseCount} beban approved</span>
              <span>Model Analisis: {data.model}</span>
              <span>Diperbarui: {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.generatedAt))}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <IconRefresh className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "Menganalisis..." : "Sinkronisasi AI"}</span>
            </button>
            <Link
              href="/reports/finance"
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Laporan Finance
            </Link>
          </div>
        </div>

        {/* 5 Core Metric Cards */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
          {/* 1. Saldo Kas Likuid */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Kas Likuid Operasional
            </span>
            <div className="mt-1.5 text-base font-bold text-slate-900 sm:text-lg">
              {rupiah(data.baseMetrics.currentCashBalance)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Batas aman: {rupiah(data.baseMetrics.minimumBufferThreshold)}
            </div>
          </div>

          {/* 2. Omzet & Gross Profit */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Omzet Penjualan (30 Hari)
            </span>
            <div className="mt-1.5 text-base font-bold text-slate-900 sm:text-lg">
              {rupiah(data.baseMetrics.past30DaysRevenue)}
            </div>
            <div className="mt-1 text-[11px] text-emerald-700 font-medium">
              Gross Profit: {rupiah(data.baseMetrics.past30DaysGrossProfit)} ({data.baseMetrics.past30DaysGrossMarginPercent}%)
            </div>
          </div>

          {/* 3. Beban Operasional */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Beban Operasional (30 Hari)
            </span>
            <div className="mt-1.5 text-base font-bold text-slate-900 sm:text-lg">
              {rupiah(data.baseMetrics.past30DaysExpenses)}
            </div>
            <div className="mt-1 text-[11px] text-slate-600">
              Burn rate: {rupiah(data.baseMetrics.dailyBurnRate)} / hari
            </div>
          </div>

          {/* 4. Laba Bersih Operasional */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Laba Bersih Operasional
            </span>
            <div className={`mt-1.5 text-base font-bold sm:text-lg ${data.baseMetrics.past30DaysNettProfit >= 0 ? "text-emerald-800" : "text-rose-800"}`}>
              {rupiah(data.baseMetrics.past30DaysNettProfit)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Setelah beban approved
            </div>
          </div>

          {/* 5. Piutang Tempo Berjalan */}
          <div className="col-span-2 sm:col-span-1 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Piutang Tempo Aktif
            </span>
            <div className="mt-1.5 text-base font-bold text-slate-900 sm:text-lg">
              {rupiah(data.baseMetrics.activeReceivablesTotal)}
            </div>
            <div className="mt-1 text-[11px] text-rose-700 font-medium">
              Overdue: {rupiah(data.baseMetrics.overdueReceivablesTotal)} ({data.baseMetrics.overdueCount} debitur)
            </div>
          </div>
        </div>

        {/* Secondary Financial Health Indicators (Institutional Micro-Scorecard) */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between rounded-md bg-white px-3 py-2 border border-slate-100 text-xs">
            <span className="text-slate-500">Ketahanan Kas (Cash Runway):</span>
            <span className="font-bold text-slate-900">{data.projections.runwayDays} Hari Operasional</span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-white px-3 py-2 border border-slate-100 text-xs">
            <span className="text-slate-500">Rasio Beban terhadap Omzet:</span>
            <span className="font-bold text-slate-900">{opexToRevenueRatio}% dari Penjualan</span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-white px-3 py-2 border border-slate-100 text-xs">
            <span className="text-slate-500">Rasio Keterlambatan Piutang:</span>
            <span className={`font-bold ${overdueRatio > 25 ? "text-rose-700" : "text-slate-900"}`}>
              {overdueRatio}% Overdue
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs - Consistent SLM Design System Standard */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("cashflow")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
            activeTab === "cashflow"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <span>Proyeksi Arus Kas 30 Hari</span>
          <span
            className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
              activeTab === "cashflow"
                ? "bg-emerald-700 text-emerald-100"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            30 Hari
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("briefing")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
            activeTab === "briefing"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <span>Executive CFO Briefing</span>
          <span
            className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
              activeTab === "briefing"
                ? "bg-emerald-700 text-emerald-100"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            Ringkasan
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ask")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
            activeTab === "ask"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <span>Konsultasi Finansial Interaktif</span>
          <span
            className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
              activeTab === "ask"
                ? "bg-emerald-700 text-emerald-100"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            Tanya CFO
          </span>
        </button>
      </div>

      {/* TAB 1: CASHFLOW PROJECTION & TIMELINE */}
      {activeTab === "cashflow" && (
        <div className="space-y-6">
          {/* Critical Liquidity Alerts (Minimalist Institutional Warning) */}
          {data.criticalAlerts.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <IconShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-2 flex-1">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-sm font-bold text-amber-950 tracking-tight">
                      Peringatan Titik Kritis Likuiditas ({data.criticalAlerts.length} Titik Evaluasi)
                    </h3>
                    <span className="text-[11px] font-semibold text-amber-800">
                      Ambang Cadangan Aman: {rupiah(data.baseMetrics.minimumBufferThreshold)}
                    </span>
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {data.criticalAlerts.map((alert, idx) => (
                      <div key={idx} className="rounded-lg bg-white p-3 border border-amber-200 text-xs text-slate-800 space-y-1.5 shadow-2xs">
                        <div className="flex justify-between items-center font-bold">
                          <span className="text-slate-900">Tanggal: {alert.date} (H+{alert.dayNumber})</span>
                          <span className="text-rose-700 font-black">Defisit: {rupiah(alert.deficitAmount)}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">{alert.reason}</p>
                        <div className="pt-1 border-t border-slate-100 text-[11px] text-slate-700">
                          <span className="font-semibold text-emerald-800">Tindakan Mitigasi:</span> {alert.recommendedAction}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Interactive 30-Day Liquidity Curve & Flow Visualization */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            {/* Quick Liquidity Runway Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
              <div className="space-y-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Saldo Awal (H+1)</span>
                <div className="text-sm font-bold text-slate-900">{rupiah(data.dailyTimeline[0]?.projectedBalance || data.baseMetrics.currentCashBalance)}</div>
                <span className="text-[10px] text-slate-500">Posisi kas likuid saat ini</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Titik Terendah 30 Hari</span>
                <div className={`text-sm font-bold ${minProjectedBalance < data.baseMetrics.minimumBufferThreshold ? "text-rose-700" : "text-slate-900"}`}>
                  {rupiah(minProjectedBalance)}
                </div>
                <span className="text-[10px] text-slate-500 font-medium">
                  {lowestBalancePoint ? `Pada H+${lowestBalancePoint.dayNumber} (${lowestBalancePoint.date.slice(5)})` : "-"}
                </span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Titik Tertinggi 30 Hari</span>
                <div className="text-sm font-bold text-emerald-800">{rupiah(maxProjectedBalance)}</div>
                <span className="text-[10px] text-slate-500 font-medium">
                  {highestBalancePoint ? `Pada H+${highestBalancePoint.dayNumber} (${highestBalancePoint.date.slice(5)})` : "-"}
                </span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Evaluasi Cadangan Buffer</span>
                <div className={`text-sm font-bold ${breachDayCount > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                  {breachDayCount > 0 ? `${breachDayCount} Hari Di Bawah Buffer` : "Cadangan Aman 30 Hari"}
                </div>
                <span className="text-[10px] text-slate-500">Ambang: {shortRupiah(data.baseMetrics.minimumBufferThreshold)}</span>
              </div>
            </div>

            {/* Header & View Mode Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  Kurva Proyeksi Ketahanan Saldo Kas (30 Hari)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Visualisasi kurva likuiditas saldo kas riil vs ambang batas cadangan minimum aman ({rupiah(data.baseMetrics.minimumBufferThreshold)}).
                </p>
              </div>

              {/* View Switcher & Legend */}
              <div className="flex flex-wrap items-center gap-3">
                {/* View Mode Buttons */}
                <div className="inline-flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setChartMode("curve")}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                      chartMode === "curve"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <IconChartArea className="w-3.5 h-3.5" />
                    <span>Kurva Saldo Kas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMode("bars")}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                      chartMode === "bars"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <IconChartBar className="w-3.5 h-3.5" />
                    <span>Mutasi Kas (Bar)</span>
                  </button>
                </div>

                {/* Legend */}
                {chartMode === "curve" ? (
                  <div className="hidden lg:flex items-center gap-3 text-[11px] text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 ring-2 ring-emerald-200" />
                      <span>Saldo Kas Berjalan</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-4 border-b-2 border-dashed border-amber-500" />
                      <span>Batas Aman Buffer</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-rose-200" />
                      <span>Di Bawah Buffer</span>
                    </div>
                  </div>
                ) : (
                  <div className="hidden lg:flex items-center gap-3 text-[11px] text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />
                      <span>Kas Masuk (+)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
                      <span>Kas Keluar (-)</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Chart Area */}
            {chartMode === "curve" ? (
              <div className="pt-2">
                <div className="w-full overflow-x-auto">
                  <div className="min-w-[680px]">
                    <svg
                      viewBox="0 0 900 240"
                      className="w-full h-auto overflow-visible select-none"
                    >
                      <defs>
                        {/* Gradient for area fill under the curve */}
                        <linearGradient id="cashCurveGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#059669" stopOpacity="0.28" />
                          <stop offset="65%" stopColor="#10b981" stopOpacity="0.08" />
                          <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
                        </linearGradient>
                      </defs>

                      {/* Y-Axis Grid Lines & Values */}
                      {yGridValues.map((gridVal, gIdx) => {
                        const gy = getCurveY(gridVal);
                        return (
                          <g key={gIdx}>
                            <line
                              x1={padLeft}
                              y1={gy}
                              x2={900 - padRight}
                              y2={gy}
                              stroke="#e2e8f0"
                              strokeWidth={1}
                              strokeDasharray="3 3"
                            />
                            <text
                              x={padLeft - 8}
                              y={gy + 3.5}
                              textAnchor="end"
                              className="text-[10px] font-mono fill-slate-400 font-medium"
                            >
                              {shortRupiah(gridVal)}
                            </text>
                          </g>
                        );
                      })}

                      {/* Minimum Buffer Threshold Reference Line */}
                      {yBuffer >= padTop && yBuffer <= padTop + plotH && (
                        <g>
                          <line
                            x1={padLeft}
                            y1={yBuffer}
                            x2={900 - padRight}
                            y2={yBuffer}
                            stroke="#f59e0b"
                            strokeWidth={1.5}
                            strokeDasharray="5 3"
                          />
                          <rect
                            x={900 - padRight - 165}
                            y={Math.max(padTop + 2, yBuffer - 16)}
                            width={165}
                            height={15}
                            rx={3}
                            fill="#fef3c7"
                            stroke="#fde68a"
                            strokeWidth={1}
                          />
                          <text
                            x={900 - padRight - 6}
                            y={Math.max(padTop + 2, yBuffer - 16) + 11}
                            textAnchor="end"
                            className="text-[9px] font-bold fill-amber-900"
                          >
                            Batas Aman: {shortRupiah(data.baseMetrics.minimumBufferThreshold)}
                          </text>
                        </g>
                      )}

                      {/* Area Fill under the curve */}
                      {curveAreaPath && (
                        <path
                          d={curveAreaPath}
                          fill="url(#cashCurveGrad)"
                        />
                      )}

                      {/* Main Balance Line Path */}
                      {curveLinePath && (
                        <path
                          d={curveLinePath}
                          fill="none"
                          stroke="#059669"
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}

                      {/* X-Axis Baseline */}
                      <line
                        x1={padLeft}
                        y1={padTop + plotH}
                        x2={900 - padRight}
                        y2={padTop + plotH}
                        stroke="#cbd5e1"
                        strokeWidth={1.5}
                      />

                      {/* X-Axis Milestone Date Labels */}
                      {data.dailyTimeline.map((pt, i) => {
                        const isMilestone = [1, 5, 10, 15, 20, 25, 30].includes(pt.dayNumber);
                        if (!isMilestone) return null;
                        const x = getCurveX(i);
                        return (
                          <g key={pt.dayNumber}>
                            <line
                              x1={x}
                              y1={padTop + plotH}
                              x2={x}
                              y2={padTop + plotH + 5}
                              stroke="#94a3b8"
                              strokeWidth={1.5}
                            />
                            <text
                              x={x}
                              y={padTop + plotH + 17}
                              textAnchor="middle"
                              className="text-[10px] font-mono fill-slate-700 font-bold"
                            >
                              H+{pt.dayNumber}
                            </text>
                            <text
                              x={x}
                              y={padTop + plotH + 28}
                              textAnchor="middle"
                              className="text-[8.5px] font-mono fill-slate-400"
                            >
                              {pt.date.slice(5)}
                            </text>
                          </g>
                        );
                      })}

                      {/* Interactive Column Hit Targets & Point Markers */}
                      {curvePoints.map((pt) => {
                        const colWidth = plotW / 30;
                        const colX = pt.x - colWidth / 2;
                        const isHovered = activeSelectedDay.dayNumber === pt.dayNumber;

                        return (
                          <g key={pt.dayNumber}>
                            {/* Hover Guide line */}
                            {isHovered && (
                              <line
                                x1={pt.x}
                                y1={padTop}
                                x2={pt.x}
                                y2={padTop + plotH}
                                stroke={pt.isBufferBreached ? "#ef4444" : "#059669"}
                                strokeWidth={1.5}
                                strokeDasharray="3 3"
                                pointerEvents="none"
                              />
                            )}

                            {/* Point Marker */}
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r={isHovered ? 6 : pt.isBufferBreached ? 4 : 3}
                              fill={pt.isBufferBreached ? "#ef4444" : "#059669"}
                              stroke="#ffffff"
                              strokeWidth={isHovered ? 2.5 : 1.5}
                              className="transition-all"
                              pointerEvents="none"
                            />

                            {/* Outer Glow on Breached Point */}
                            {pt.isBufferBreached && !isHovered && (
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r={6.5}
                                fill="#ef4444"
                                opacity={0.25}
                                pointerEvents="none"
                              />
                            )}

                            {/* Outer Glow on Hovered Point */}
                            {isHovered && (
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r={9}
                                fill={pt.isBufferBreached ? "#ef4444" : "#059669"}
                                opacity={0.2}
                                pointerEvents="none"
                              />
                            )}

                            {/* Transparent Hit Target for Mouse Interaction */}
                            <rect
                              x={Math.max(padLeft, colX)}
                              y={padTop}
                              width={colWidth}
                              height={plotH + 32}
                              fill="transparent"
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredDay(pt.dayNumber)}
                              onClick={() => setHoveredDay(pt.dayNumber)}
                            />
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              </div>
            ) : (
              /* Mode 2: Clear Grouped Bar Chart */
              <div className="pt-2">
                <div className="grid grid-cols-10 sm:grid-cols-15 lg:grid-cols-30 gap-1 items-end h-44 border-b border-slate-200 pb-2">
                  {data.dailyTimeline.map((pt) => {
                    const inflowHeight = Math.max(6, Math.min(100, Math.round((pt.projectedInflow / maxTimelineFlow) * 100)));
                    const outflowHeight = Math.max(6, Math.min(100, Math.round((pt.projectedOutflow / maxTimelineFlow) * 100)));
                    const isHovered = activeSelectedDay.dayNumber === pt.dayNumber;

                    return (
                      <div
                        key={pt.dayNumber}
                        onMouseEnter={() => setHoveredDay(pt.dayNumber)}
                        onClick={() => setHoveredDay(pt.dayNumber)}
                        className={`relative flex flex-col justify-end items-center h-full cursor-pointer rounded-sm px-0.5 transition-colors ${
                          pt.isBufferBreached ? "bg-amber-50/80" : "hover:bg-slate-50"
                        } ${isHovered ? "ring-2 ring-emerald-500 bg-emerald-50/50" : ""}`}
                      >
                        <div className="w-full flex items-end justify-center gap-0.5 h-full">
                          {/* Inflow bar */}
                          <div
                            style={{ height: `${inflowHeight}%` }}
                            className="w-1/2 bg-emerald-600 rounded-t-sm transition-all"
                            title={`Kas Masuk: +${rupiah(pt.projectedInflow)}`}
                          />
                          {/* Outflow bar */}
                          <div
                            style={{ height: `${outflowHeight}%` }}
                            className="w-1/2 bg-rose-500 rounded-t-sm transition-all"
                            title={`Kas Keluar: -${rupiah(pt.projectedOutflow)}`}
                          />
                        </div>
                        <span className={`mt-1 text-[9px] font-mono ${isHovered ? "font-bold text-emerald-800" : "text-slate-400"}`}>
                          {pt.dayNumber}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Daily Liquidity Detail Card */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="inline-flex items-center rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white font-mono">
                    H+{activeSelectedDay.dayNumber} &bull; {activeSelectedDay.date}
                  </span>
                  {activeSelectedDay.isBufferBreached ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-800">
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      Di Bawah Batas Cadangan Aman (Defisit {rupiah(data.baseMetrics.minimumBufferThreshold - activeSelectedDay.projectedBalance)})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Cadangan Likuid Aman (+{rupiah(activeSelectedDay.projectedBalance - data.baseMetrics.minimumBufferThreshold)} di atas batas)
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  Arahkan kursor atau klik titik pada kurva untuk melihat rincian tanggal lain
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Proyeksi Saldo Kas */}
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Proyeksi Saldo Kas
                  </span>
                  <div className={`mt-1 text-base font-bold ${activeSelectedDay.isBufferBreached ? "text-rose-700" : "text-slate-900"}`}>
                    {rupiah(activeSelectedDay.projectedBalance)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    Batas cadangan: {shortRupiah(data.baseMetrics.minimumBufferThreshold)}
                  </div>
                </div>

                {/* 2. Kas Masuk Hari Ini */}
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <span className="block text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
                    Kas Masuk Harian (+)
                  </span>
                  <div className="mt-1 text-base font-bold text-emerald-800">
                    +{rupiah(activeSelectedDay.projectedInflow)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    Penjualan: {shortRupiah(activeSelectedDay.inflowBreakdown.expectedDailySales)}
                    {activeSelectedDay.inflowBreakdown.expectedTempoCollections > 0 && (
                      <span className="block text-emerald-600 font-semibold">
                        Tempo: +{shortRupiah(activeSelectedDay.inflowBreakdown.expectedTempoCollections)}
                      </span>
                    )}
                  </div>
                </div>

                {/* 3. Kas Keluar Hari Ini */}
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <span className="block text-[11px] font-semibold text-rose-700 uppercase tracking-wider">
                    Kas Keluar Harian (-)
                  </span>
                  <div className="mt-1 text-base font-bold text-rose-800">
                    -{rupiah(activeSelectedDay.projectedOutflow)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    Beban: {shortRupiah(activeSelectedDay.outflowBreakdown.expectedOperationalExpenses)}
                    {activeSelectedDay.outflowBreakdown.expectedRestock > 0 && (
                      <span className="block text-rose-600 font-semibold">
                        Restock: -{shortRupiah(activeSelectedDay.outflowBreakdown.expectedRestock)}
                      </span>
                    )}
                  </div>
                </div>

                {/* 4. Arus Kas Bersih (Net Flow) */}
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Arus Kas Bersih (Net Flow)
                  </span>
                  {(() => {
                    const netFlow = activeSelectedDay.projectedInflow - activeSelectedDay.projectedOutflow;
                    return (
                      <>
                        <div className={`mt-1 text-base font-bold ${netFlow >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {netFlow >= 0 ? `+${rupiah(netFlow)}` : `-${rupiah(Math.abs(netFlow))}`}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {netFlow >= 0 ? "Surplus kas hari ini" : "Defisit kas hari ini"}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Priority Collections Box (Debt Acceleration Hub with Search, Filter, Sort & Pagination) */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  Daftar Debitur Piutang Tempo ({filteredDebtors.length} dari {data.priorityCollections.length} Aktif)
                </h3>
                <p className="text-xs text-slate-500">
                  Akselerasi penerimaan kas piutang dengan draf penagihan formal dan pemantauan jatuh tempo.
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                Total Piutang: {rupiah(data.baseMetrics.activeReceivablesTotal)}
              </span>
            </div>

            {/* Debtor Controls Bar: Search, Filter Tabs, Sort, Page Size */}
            <div className="space-y-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                {/* Search Input */}
                <div className="relative flex-1">
                  <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={debtorSearch}
                    onChange={(e) => {
                      setDebtorSearch(e.target.value);
                      setDebtorPage(1);
                    }}
                    placeholder="Cari nama debitur customer..."
                    className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-8 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs"
                  />
                  {debtorSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setDebtorSearch("");
                        setDebtorPage(1);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <IconX className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Sort Dropdown */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-slate-600 whitespace-nowrap">Urutkan:</span>
                  <select
                    value={debtorSort}
                    onChange={(e) => {
                      setDebtorSort(e.target.value as any);
                      setDebtorPage(1);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="DUE_ASC">Jatuh Tempo Terdekat</option>
                    <option value="AMOUNT_DESC">Nominal Tertinggi</option>
                    <option value="NAME_ASC">Nama Customer (A–Z)</option>
                  </select>
                </div>
              </div>

              {/* Status Filter Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60">
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <span>Filter Status:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDebtorFilter("ALL");
                      setDebtorPage(1);
                    }}
                    className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                      debtorFilter === "ALL"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                    }`}
                  >
                    Semua ({data.priorityCollections.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDebtorFilter("OVERDUE");
                      setDebtorPage(1);
                    }}
                    className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                      debtorFilter === "OVERDUE"
                        ? "bg-rose-600 text-white shadow-xs"
                        : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                    }`}
                  >
                    Lewat Tempo ({overdueDebtorCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDebtorFilter("UPCOMING_7");
                      setDebtorPage(1);
                    }}
                    className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                      debtorFilter === "UPCOMING_7"
                        ? "bg-amber-600 text-white shadow-xs"
                        : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                    }`}
                  >
                    Jatuh Tempo &lt; 7 Hari ({upcoming7DebtorCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDebtorFilter("UPCOMING_LATER");
                      setDebtorPage(1);
                    }}
                    className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                      debtorFilter === "UPCOMING_LATER"
                        ? "bg-slate-700 text-white shadow-xs"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                    }`}
                  >
                    Jatuh Tempo &gt; 7 Hari
                  </button>
                </div>

                <span className="text-xs text-slate-500 font-medium">
                  Ditemukan: <b>{filteredDebtors.length}</b> debitur
                </span>
              </div>
            </div>

            {/* Debtor Grid */}
            {paginatedDebtors.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {paginatedDebtors.map((target, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-200 p-3.5 space-y-2.5 bg-slate-50/50 shadow-2xs">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="font-bold text-xs text-slate-900 block">{target.customerName}</span>
                        <span className="text-[11px] text-slate-500 font-mono">Jatuh Tempo: {target.dueDate}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${
                        target.urgency === "HIGH"
                          ? "bg-rose-100 text-rose-800 border border-rose-200"
                          : target.urgency === "MEDIUM"
                          ? "bg-amber-100 text-amber-800 border border-amber-200"
                          : "bg-slate-200 text-slate-700"
                      }`}>
                        {target.daysUntilDue <= 0 ? "Lewat Tempo" : `${target.daysUntilDue} Hari Lagi`}
                      </span>
                    </div>

                    <div className="text-sm font-bold text-slate-900">
                      {rupiah(target.amount)}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyScript(target.suggestedScript, idx)}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
                    >
                      {copiedIndex === idx ? (
                        <>
                          <IconCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700 font-bold">Tersalin ke Clipboard</span>
                        </>
                      ) : (
                        <>
                          <IconCopy className="w-3.5 h-3.5 text-slate-500" />
                          <span>Salin Draf Penagihan Formal</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-300 space-y-2">
                <p className="text-xs text-slate-600 font-medium">
                  Tidak ada data debitur yang sesuai dengan kriteria filter atau pencarian yang dipilih.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setDebtorSearch("");
                    setDebtorFilter("ALL");
                    setDebtorPage(1);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Reset Filter &amp; Pencarian
                </button>
              </div>
            )}

            {/* Debtor Pagination Controls (Standard SLM Design System) */}
            {filteredDebtors.length > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3 rounded-b-xl sm:flex-row sm:px-6">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span>Menampilkan</span>
                  <select
                    value={debtorPageSize}
                    onChange={(e) => {
                      setDebtorPageSize(Number(e.target.value));
                      setDebtorPage(1);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value={6}>6</option>
                    <option value={12}>12</option>
                    <option value={24}>24</option>
                  </select>
                  <span>
                    dari <b>{filteredDebtors.length}</b> debitur (Hal. {debtorPage} dari {totalDebtorPages})
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDebtorPage((p) => Math.max(1, p - 1))}
                    disabled={debtorPage === 1}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Sebelumnya
                  </button>

                  {Array.from({ length: Math.min(5, totalDebtorPages) }, (_, i) => {
                    let pageNum = i + 1;
                    if (totalDebtorPages > 5) {
                      if (debtorPage > 3) {
                        pageNum = Math.min(totalDebtorPages - 4 + i, debtorPage - 2 + i);
                      }
                    }
                    if (pageNum <= 0 || pageNum > totalDebtorPages) return null;
                    return (
                      <button
                        key={`debtor-page-${pageNum}`}
                        type="button"
                        onClick={() => setDebtorPage(pageNum)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                          debtorPage === pageNum
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setDebtorPage((p) => Math.min(totalDebtorPages, p + 1))}
                    disabled={debtorPage === totalDebtorPages}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Daily 30-Day Timeline Table (With Search, Multi-Filter & Pagination) */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  Rincian Arus Kas 30 Hari Ke Depan
                </h3>
                <p className="text-xs text-slate-500">
                  Simulasi mutasi kas harian, jadwal kas masuk piutang tempo, dan pengeluaran restock stok barang.
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                Horizon: 30 Hari Proyeksi
              </span>
            </div>

            {/* Timeline Controls Bar */}
            <div className="space-y-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                {/* Search Input */}
                <div className="relative flex-1">
                  <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={timelineSearch}
                    onChange={(e) => {
                      setTimelineSearch(e.target.value);
                      setTimelinePage(1);
                    }}
                    placeholder="Cari tanggal (contoh: 2026-09 atau H+7)..."
                    className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-8 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs"
                  />
                  {timelineSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setTimelineSearch("");
                        setTimelinePage(1);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <IconX className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Week Filter Selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-slate-600 whitespace-nowrap">Periode:</span>
                  <select
                    value={timelineFilterWeek}
                    onChange={(e) => {
                      setTimelineFilterWeek(e.target.value as any);
                      setTimelinePage(1);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="ALL">Semua Minggu (H+1 s/d H+30)</option>
                    <option value="W1">Minggu 1 (H+1 s/d H+7)</option>
                    <option value="W2">Minggu 2 (H+8 s/d H+14)</option>
                    <option value="W3">Minggu 3 (H+15 s/d H+21)</option>
                    <option value="W4">Minggu 4 (H+22 s/d H+30)</option>
                  </select>
                </div>
              </div>

              {/* Condition Filters */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60">
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <span>Filter Kondisi:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setTimelineFilterCondition("ALL");
                      setTimelinePage(1);
                    }}
                    className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                      timelineFilterCondition === "ALL"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                    }`}
                  >
                    Semua Hari (30)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTimelineFilterCondition("BUFFER_BREACH");
                      setTimelinePage(1);
                    }}
                    className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                      timelineFilterCondition === "BUFFER_BREACH"
                        ? "bg-amber-600 text-white shadow-xs"
                        : "bg-amber-50 text-amber-900 hover:bg-amber-100"
                    }`}
                  >
                    Di Bawah Buffer ({breachDayCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTimelineFilterCondition("TEMPO_INFLOW");
                      setTimelinePage(1);
                    }}
                    className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                      timelineFilterCondition === "TEMPO_INFLOW"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    }`}
                  >
                    Kas Masuk Tempo ({tempoInflowDayCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTimelineFilterCondition("RESTOCK_OUTFLOW");
                      setTimelinePage(1);
                    }}
                    className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                      timelineFilterCondition === "RESTOCK_OUTFLOW"
                        ? "bg-rose-600 text-white shadow-xs"
                        : "bg-rose-50 text-rose-800 hover:bg-rose-100"
                    }`}
                  >
                    Belanja Restock ({restockDayCount})
                  </button>
                </div>

                <span className="text-xs text-slate-500 font-medium">
                  Ditemukan: <b>{filteredTimeline.length}</b> hari
                </span>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="px-3.5 py-2.5">Hari</th>
                    <th className="px-3.5 py-2.5">Tanggal</th>
                    <th className="px-3.5 py-2.5 text-right">Ekspektasi Kas Masuk</th>
                    <th className="px-3.5 py-2.5 text-right">Ekspektasi Kas Keluar</th>
                    <th className="px-3.5 py-2.5 text-right">Proyeksi Saldo Kas</th>
                    <th className="px-3.5 py-2.5 text-center">Status Cadangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedTimeline.map((row) => (
                    <tr key={row.dayNumber} className={row.isBufferBreached ? "bg-amber-50/50" : "hover:bg-slate-50/70"}>
                      <td className="px-3.5 py-2.5 font-bold text-slate-600 font-mono">H+{row.dayNumber}</td>
                      <td className="px-3.5 py-2.5 text-slate-800 font-mono">{row.date}</td>
                      <td className="px-3.5 py-2.5 text-right font-medium text-emerald-700">
                        +{rupiah(row.projectedInflow)}
                        {row.inflowBreakdown.expectedTempoCollections > 0 && (
                          <span className="block text-[10px] text-emerald-600">
                            (Tempo: {rupiah(row.inflowBreakdown.expectedTempoCollections)})
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-medium text-rose-700">
                        -{rupiah(row.projectedOutflow)}
                        {row.outflowBreakdown.expectedRestock > 0 && (
                          <span className="block text-[10px] text-rose-600">
                            (Restock: {rupiah(row.outflowBreakdown.expectedRestock)})
                          </span>
                        )}
                      </td>
                      <td className={`px-3.5 py-2.5 text-right font-bold ${row.isBufferBreached ? "text-rose-700" : "text-slate-900"}`}>
                        {rupiah(row.projectedBalance)}
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        {row.isBufferBreached ? (
                          <span className="inline-block px-2 py-0.5 rounded-sm text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                            Di Bawah Buffer
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-sm text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                            Aman
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {paginatedTimeline.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        Tidak ada titik proyeksi yang sesuai dengan filter atau pencarian tanggal yang dipilih.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Timeline Pagination Controls (Standard SLM Design System) */}
            {filteredTimeline.length > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3 rounded-b-xl sm:flex-row sm:px-6">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span>Menampilkan</span>
                  <select
                    value={timelinePageSize}
                    onChange={(e) => {
                      setTimelinePageSize(Number(e.target.value));
                      setTimelinePage(1);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={30}>30</option>
                  </select>
                  <span>
                    dari <b>{filteredTimeline.length}</b> hari (Hal. {timelinePage} dari {totalTimelinePages})
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTimelinePage((p) => Math.max(1, p - 1))}
                    disabled={timelinePage === 1}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Sebelumnya
                  </button>

                  {Array.from({ length: Math.min(5, totalTimelinePages) }, (_, i) => {
                    let pageNum = i + 1;
                    if (totalTimelinePages > 5) {
                      if (timelinePage > 3) {
                        pageNum = Math.min(totalTimelinePages - 4 + i, timelinePage - 2 + i);
                      }
                    }
                    if (pageNum <= 0 || pageNum > totalTimelinePages) return null;
                    return (
                      <button
                        key={`timeline-page-${pageNum}`}
                        type="button"
                        onClick={() => setTimelinePage(pageNum)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                          timelinePage === pageNum
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setTimelinePage((p) => Math.min(totalTimelinePages, p + 1))}
                    disabled={timelinePage === totalTimelinePages}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* TAB 2: EXECUTIVE CFO BRIEFING */}
      {activeTab === "briefing" && (
        <div className="space-y-6">
          {/* Executive Headline - Formal Corporate Memo */}
          <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 sm:p-6 shadow-xs">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <span>MEMORANDUM ANALISIS EKSEKUTIF CFO</span>
              <span>&bull;</span>
              <span>PERSPEKTIF 30 HARI</span>
            </div>
            <h2 className="mt-2 text-base sm:text-lg font-bold text-slate-900 leading-snug">
              {data.executiveSummary.headline}
            </h2>
          </div>

          {/* 3 Analysis Pillar Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Profitabilitas &amp; Margin</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Margin: {data.baseMetrics.past30DaysGrossMarginPercent}%
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600">
                {data.executiveSummary.profitabilityAnalysis}
              </p>
              <div className="pt-2 border-t border-slate-100 flex justify-between text-[11px] text-slate-500">
                <span>Omzet: {rupiah(data.baseMetrics.past30DaysRevenue)}</span>
                <span className="font-semibold text-slate-800">Laba Bersih: {rupiah(data.baseMetrics.past30DaysNettProfit)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Efisiensi Struktur Biaya</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200">
                  Burn: {rupiah(data.baseMetrics.dailyBurnRate)}/hari
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600">
                {data.executiveSummary.costEfficiencyAnalysis}
              </p>
              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                Total Beban 30 Hari: <span className="font-semibold text-slate-800">{rupiah(data.baseMetrics.past30DaysExpenses)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Kesehatan Piutang Usaha</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Tempo: {rupiah(data.baseMetrics.activeReceivablesTotal)}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600">
                {data.executiveSummary.accountsReceivableHealth}
              </p>
              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                Overdue: <span className="font-semibold text-rose-700">{rupiah(data.baseMetrics.overdueReceivablesTotal)}</span> ({data.baseMetrics.overdueCount} debitur)
              </div>
            </div>
          </div>

          {/* Top 5 Expense Categories Breakdown Visual */}
          {data.baseMetrics.topExpenseCategories && data.baseMetrics.topExpenseCategories.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  Alokasi 5 Pos Pengeluaran Operasional Terbesar
                </h3>
                <span className="text-[11px] text-slate-500">
                  Total Beban: {rupiah(data.baseMetrics.past30DaysExpenses)}
                </span>
              </div>
              <div className="space-y-3">
                {data.baseMetrics.topExpenseCategories.map((cat, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-700">{cat.category}</span>
                      <span className="text-slate-900 font-semibold">{rupiah(cat.amount)} ({cat.percentage}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        style={{ width: `${Math.min(100, Math.max(3, cat.percentage))}%` }}
                        className="bg-slate-700 h-2 rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Weekly Action Priorities */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Rencana Tindakan Prioritas Mingguan untuk Owner
            </h3>
            <div className="space-y-2.5">
              {data.executiveSummary.weeklyActionPriorities.map((item, idx) => (
                <div key={idx} className="flex items-start gap-3 rounded-lg bg-slate-50/80 p-3.5 border border-slate-200 text-xs text-slate-800">
                  <span className="grid h-5 w-5 place-items-center rounded-sm bg-slate-800 text-white font-mono font-bold text-[10px] shrink-0">
                    {idx + 1}
                  </span>
                  <span className="leading-relaxed">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ASK AI CFO INTERACTIVE CONSULTATION */}
      {activeTab === "ask" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">Konsultasi Keputusan Finansial (Asisten CFO)</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Konsultasikan simulasi keputusan operasional, analisis rasio likuiditas, dan perencanaan belanja kas secara langsung.
              </p>
            </div>

            {/* Quick Strategic Prompts */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Topik Evaluasi Strategis:</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {quickQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAskCfo(q)}
                    disabled={asking}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors disabled:opacity-50 text-left shadow-2xs"
                  >
                    <span>{q}</span>
                    <IconArrowNarrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {/* Chat History Box */}
            <div className="space-y-3.5 rounded-xl border border-slate-200 bg-slate-50/60 p-4 min-h-[280px] max-h-[500px] overflow-y-auto">
              {chatHistory.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}>
                  <div
                    className={`max-w-2xl rounded-xl p-4 text-xs leading-relaxed shadow-xs ${
                      msg.sender === "user"
                        ? "bg-slate-800 text-white rounded-br-xs"
                        : "bg-white text-slate-800 border border-slate-200 rounded-bl-xs space-y-3"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 text-[10px] opacity-70 mb-1 border-b border-slate-100/40 pb-1">
                      <span className="font-bold">{msg.sender === "user" ? "Owner / Dewan Direksi" : "Virtual Chief Financial Officer"}</span>
                      <span>{msg.timestamp}</span>
                    </div>
                    <p className="whitespace-pre-line text-xs leading-relaxed">{msg.text}</p>

                    {msg.highlights && msg.highlights.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                        {msg.highlights.map((h, hIdx) => (
                          <span key={hIdx} className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-800 border border-slate-200">
                            {h}
                          </span>
                        ))}
                      </div>
                    )}

                    {msg.action && (
                      <div className="rounded-md bg-emerald-50 p-2.5 border border-emerald-200 text-[11px] text-emerald-950">
                        <span className="font-bold text-emerald-900 block mb-0.5">Rekomendasi Langkah Strategis:</span>
                        {msg.action}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {asking && (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                  <IconRefresh className="w-3.5 h-3.5 animate-spin" />
                  <span>Menganalisis data finansial dan memformulasikan rekomendasi...</span>
                </div>
              )}
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAskCfo();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ketik pertanyaan atau simulasi keuangan (contoh: Apakah aman belanja stok 50 juta minggu ini?)..."
                disabled={asking}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs"
              />
              <button
                type="submit"
                disabled={asking || !question.trim()}
                className="rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {asking ? "Memproses..." : "Kirim Analisis"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
