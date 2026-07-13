ALTER TABLE "SalesRecord"
ADD COLUMN "stockReleaseStatus" TEXT NOT NULL DEFAULT 'not_required',
ADD COLUMN "stockReleaseError" TEXT,
ADD COLUMN "stockReleaseReference" TEXT,
ADD COLUMN "stockReleasedAt" TIMESTAMP(3);

ALTER TABLE "SalesRecordItem"
ADD COLUMN "warehouseId" TEXT,
ADD COLUMN "warehouseNameSnapshot" TEXT,
ADD COLUMN "rackId" TEXT,
ADD COLUMN "rackNameSnapshot" TEXT;

CREATE INDEX "SalesRecord_stockReleaseStatus_idx" ON "SalesRecord"("stockReleaseStatus");
CREATE INDEX "SalesRecord_stockReleaseReference_idx" ON "SalesRecord"("stockReleaseReference");
