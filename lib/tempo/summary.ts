export type OpenTempoStatus = "open" | "overdue" | "partial_paid";

export type TempoSummaryInput = {
  status: string;
  remainingAmount?: number;
};

export function isOpenTempoStatus(status: string): status is OpenTempoStatus {
  return status === "open" || status === "overdue" || status === "partial_paid";
}

export function summarizeOpenTempo<T extends TempoSummaryInput>(rows: T[]) {
  const openTempo = rows.filter((row) => isOpenTempoStatus(row.status));
  return {
    openTempo,
    openTempoAmount: openTempo.reduce((sum, row) => sum + (row.remainingAmount || 0), 0)
  };
}

export type TempoMetricsSummary = {
  total: {
    count: number;
    amount: number;
  };
  overdue: {
    count: number;
    amount: number;
    percentage: number;
  };
  comingSoonH3: {
    count: number;
    amount: number;
    percentage: number;
    fromDate: string;
    toDate: string;
  };
  beyondH3: {
    count: number;
    amount: number;
    percentage: number;
    fromDate: string;
  };
};

export type TempoMetricRowInput = {
  status: string;
  remainingAmount?: number | { toNumber?: () => number } | string | null | unknown;
  dueDate: string | Date;
};

export function toDateKeyString(dateVal: string | Date): string {
  if (dateVal instanceof Date) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(dateVal);
  }
  if (typeof dateVal === "string") {
    const trimmed = dateVal.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(d);
    }
  }
  return "";
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const nextY = dt.getFullYear();
  const nextM = String(dt.getMonth() + 1).padStart(2, "0");
  const nextD = String(dt.getDate()).padStart(2, "0");
  return `${nextY}-${nextM}-${nextD}`;
}

export function calculateTempoMetricsSummary<T extends TempoMetricRowInput>(
  rows: T[],
  todayKey: string
): TempoMetricsSummary {
  const activeRows = rows.filter((row) => isOpenTempoStatus(row.status));

  const h3ToDate = addDaysToDateKey(todayKey, 3);
  const beyondFromDate = addDaysToDateKey(todayKey, 4);

  let totalAmount = 0;
  let overdueAmount = 0;
  let overdueCount = 0;
  let comingSoonAmount = 0;
  let comingSoonCount = 0;
  let beyondAmount = 0;
  let beyondCount = 0;

  for (const row of activeRows) {
    const rawRem = row.remainingAmount;
    const rem =
      typeof rawRem === "object" && rawRem !== null && "toNumber" in rawRem && typeof (rawRem as any).toNumber === "function"
        ? (rawRem as any).toNumber()
        : Number(rawRem) || 0;
    const dueKey = toDateKeyString(row.dueDate);
    totalAmount += rem;

    if (dueKey < todayKey) {
      overdueCount++;
      overdueAmount += rem;
    } else if (dueKey <= h3ToDate) {
      comingSoonCount++;
      comingSoonAmount += rem;
    } else {
      beyondCount++;
      beyondAmount += rem;
    }
  }

  const calcPercent = (amt: number) =>
    totalAmount > 0 ? Math.round((amt / totalAmount) * 1000) / 10 : 0;

  return {
    total: {
      count: activeRows.length,
      amount: totalAmount
    },
    overdue: {
      count: overdueCount,
      amount: overdueAmount,
      percentage: calcPercent(overdueAmount)
    },
    comingSoonH3: {
      count: comingSoonCount,
      amount: comingSoonAmount,
      percentage: calcPercent(comingSoonAmount),
      fromDate: todayKey,
      toDate: h3ToDate
    },
    beyondH3: {
      count: beyondCount,
      amount: beyondAmount,
      percentage: calcPercent(beyondAmount),
      fromDate: beyondFromDate
    }
  };
}
