ALTER TABLE "SalesRecord"
ADD COLUMN "syncError" TEXT,
ADD COLUMN "syncAttemptedAt" TIMESTAMP(3),
ADD COLUMN "syncedAt" TIMESTAMP(3);

CREATE INDEX "SalesRecord_syncAttemptedAt_idx" ON "SalesRecord"("syncAttemptedAt");
