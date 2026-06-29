import type { ApprovalStatus } from "./store";

export const APPROVAL_ACTIONS = ["approve", "reject"] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export function isApprovalAction(value: unknown): value is ApprovalAction {
  return APPROVAL_ACTIONS.includes(value as ApprovalAction);
}

export function validateApprovalTransition(status: ApprovalStatus, action: ApprovalAction, reason?: string) {
  if (status !== "pending_approval") return "Approval hanya dapat diproses saat status pending.";
  if (action === "reject" && !reason?.trim()) return "Alasan reject wajib diisi.";
  return null;
}
