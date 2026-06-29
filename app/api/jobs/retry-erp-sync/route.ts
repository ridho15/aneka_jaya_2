import { NextResponse } from "next/server";
import { rejectIfInvalidCron } from "@/lib/jobs/cronAuth";
import { recordAudit } from "@/lib/audit/store";
import { retryPendingSalesErpSync } from "@/lib/erpSync/salesRetry";
import { retryPendingExpenseErpSync } from "@/lib/erpSync/expenseRetry";

export async function POST(request: Request) {
  const rejected = rejectIfInvalidCron(request);
  if (rejected) return rejected;
  const [sales, expenses] = await Promise.all([retryPendingSalesErpSync(), retryPendingExpenseErpSync()]);
  const result = {
    attempted: sales.attempted + expenses.attempted,
    succeeded: sales.succeeded + expenses.succeeded,
    failed: sales.failed + expenses.failed,
    sales,
    expenses
  };
  await recordAudit({ entityType: "erp_sync", entityId: `retry-${Date.now()}`, action: "retry_sync", afterValue: result, reason: `Retry ERP sync job: ${result.succeeded} berhasil, ${result.failed} gagal` });
  return NextResponse.json({ success: true, data: result });
}
