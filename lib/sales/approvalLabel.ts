const APPROVAL_LABEL: Record<string, string> = {
  approved: "Disetujui",
  draft: "Draft",
  pending_approval: "Menunggu",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};

export function approvalLabel(value?: string) {
  return APPROVAL_LABEL[value || "approved"] || value || "Disetujui";
}
