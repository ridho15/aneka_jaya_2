CREATE TABLE "ExpenseRecord" (
  "id" TEXT NOT NULL,
  "expenseDate" TIMESTAMP(3) NOT NULL,
  "tipeId" TEXT NOT NULL,
  "tipeCodeSnapshot" TEXT NOT NULL,
  "tipeNameSnapshot" TEXT NOT NULL,
  "rekeningId" TEXT NOT NULL,
  "rekeningNameSnapshot" TEXT NOT NULL,
  "coaId" TEXT NOT NULL,
  "coaNameSnapshot" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "vendorName" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "attachmentUrl" TEXT,
  "notes" TEXT,
  "approvalStatus" TEXT NOT NULL,
  "erpSyncTarget" TEXT NOT NULL DEFAULT 'local',
  "erpSyncStatus" TEXT NOT NULL DEFAULT 'not_required',
  "erpSyncError" TEXT,
  "erpSyncAttemptedAt" TIMESTAMP(3),
  "erpSyncedAt" TIMESTAMP(3),
  "erpReference" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdByNameSnapshot" TEXT NOT NULL,
  "createdByRoleSnapshot" "Role" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExpenseRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExpenseRecord_expenseDate_idx" ON "ExpenseRecord"("expenseDate");
CREATE INDEX "ExpenseRecord_approvalStatus_idx" ON "ExpenseRecord"("approvalStatus");
CREATE INDEX "ExpenseRecord_erpSyncTarget_erpSyncStatus_idx" ON "ExpenseRecord"("erpSyncTarget", "erpSyncStatus");
CREATE INDEX "ExpenseRecord_erpSyncAttemptedAt_idx" ON "ExpenseRecord"("erpSyncAttemptedAt");
