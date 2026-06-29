export type Expense = {
  id: string; expenseDate: string; tipeId?: string; tipeCodeSnapshot?: string; tipeNameSnapshot?: string; rekeningId?: string; rekeningNameSnapshot?: string; coaId?: string; coaNameSnapshot?: string; category: string; vendorName: string; description: string;
  amount: number; paymentMethod: string; attachmentUrl?: string; notes?: string;
  approvalStatus?: "draft" | "pending_approval" | "approved" | "rejected" | "cancelled";
  erpSyncStatus?: "pending" | "synced" | "failed" | "not_required";
};
