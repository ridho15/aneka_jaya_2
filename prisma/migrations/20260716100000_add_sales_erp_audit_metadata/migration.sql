ALTER TABLE "SalesRecord"
  ADD COLUMN "erpSyncHttpStatus" INTEGER,
  ADD COLUMN "erpSyncResponse" JSONB,
  ADD COLUMN "stockReleaseHttpStatus" INTEGER,
  ADD COLUMN "stockReleaseResponse" JSONB;
