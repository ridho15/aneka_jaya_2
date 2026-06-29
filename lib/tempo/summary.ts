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
