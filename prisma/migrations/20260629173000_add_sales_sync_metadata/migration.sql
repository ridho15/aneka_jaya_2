ALTER TABLE "SalesRecord"
ADD COLUMN "syncTarget" TEXT NOT NULL DEFAULT 'local',
ADD COLUMN "syncStatus" TEXT NOT NULL DEFAULT 'local',
ADD COLUMN "erpReference" TEXT,
ADD COLUMN "testReference" TEXT,
ADD COLUMN "isTestTransaction" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "SalesRecord_syncTarget_syncStatus_idx" ON "SalesRecord"("syncTarget", "syncStatus");
CREATE INDEX "SalesRecord_testReference_idx" ON "SalesRecord"("testReference");
