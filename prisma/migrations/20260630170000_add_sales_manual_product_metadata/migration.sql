ALTER TABLE "SalesRecordItem" ADD COLUMN "productId" TEXT;
ALTER TABLE "SalesRecordItem" ADD COLUMN "manualProduct" JSONB;

CREATE INDEX "SalesRecordItem_productId_idx" ON "SalesRecordItem"("productId");
