import { NextResponse } from "next/server";
import { rejectIfInvalidCron } from "@/lib/jobs/cronAuth";
import { recordAudit } from "@/lib/audit/store";
import { retryPendingSalesErpSync } from "@/lib/erpSync/salesRetry";
import { retryPendingExpenseErpSync } from "@/lib/erpSync/expenseRetry";
import { retryFailedMjJournals } from "@/lib/integrations/mj/service";

export async function POST(request: Request) {
  const rejected = rejectIfInvalidCron(request);
  if (rejected) return rejected;
  const [sales, expenses, mjJournals] = await Promise.all([retryPendingSalesErpSync(), retryPendingExpenseErpSync(), retryFailedMjJournals()]);
  const result = {
    attempted: sales.attempted + expenses.attempted + mjJournals.attempted,
    succeeded: sales.succeeded + expenses.succeeded + mjJournals.succeeded,
    failed: sales.failed + expenses.failed + mjJournals.failed,
    sales,
    expenses,
    mjJournals
  };
  await recordAudit({ entityType: "erp_sync", entityId: `retry-${Date.now()}`, action: "retry_sync", afterValue: result, reason: `Retry ERP sync job: ${result.succeeded} berhasil, ${result.failed} gagal` });
  return NextResponse.json({ success: true, data: result });
}
