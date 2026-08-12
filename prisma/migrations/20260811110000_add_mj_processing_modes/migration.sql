ALTER TABLE "SalesRecord" ADD COLUMN "integrationProcessingMode" TEXT;

UPDATE "SalesRecord"
SET "integrationProcessingMode" = 'slm_process_aj'
WHERE "source" = 'MJ' AND "integrationProcessingMode" IS NULL;

CREATE INDEX "SalesRecord_integrationProcessingMode_idx" ON "SalesRecord"("integrationProcessingMode");
