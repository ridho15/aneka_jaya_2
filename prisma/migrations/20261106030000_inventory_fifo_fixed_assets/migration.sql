-- Persediaan sebagai aset: lapisan FIFO, nilai biaya per pergerakan, aset tetap, kelompok neraca.
ALTER TABLE "Account" ADD COLUMN "reportGroup" TEXT;
UPDATE "Account" SET "reportGroup" = CASE
  WHEN "category" = 'ASSET' AND "code" LIKE '1-2%' AND "normalBalance" = 'CREDIT' THEN 'CONTRA_FIXED_ASSET'
  WHEN "category" = 'ASSET' AND "code" LIKE '1-2%' THEN 'FIXED_ASSET'
  WHEN "category" = 'ASSET' AND "code" LIKE '1-1%' THEN 'CURRENT_ASSET'
  WHEN "category" = 'ASSET' THEN 'OTHER_ASSET'
  WHEN "category" = 'LIABILITY' AND "code" LIKE '2-2%' THEN 'LONG_TERM_LIABILITY'
  WHEN "category" = 'LIABILITY' THEN 'CURRENT_LIABILITY'
  ELSE NULL END;

ALTER TABLE "SalesRecord" ADD COLUMN "cogsStatus" TEXT, ADD COLUMN "cogsNote" TEXT;

ALTER TABLE "InventoryMovement"
  ADD COLUMN "totalCost" DECIMAL(18,2),
  ADD COLUMN "costComplete" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "costNote" TEXT;

CREATE TABLE "InventoryCostLayer" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "movementId" TEXT,
  "source" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "remaining" DECIMAL(18,4) NOT NULL,
  "unitCost" DECIMAL(18,4) NOT NULL,
  "costKnown" BOOLEAN NOT NULL DEFAULT true,
  "inLedger" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryCostLayer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryCostLayer_movementId_key" ON "InventoryCostLayer"("movementId");
CREATE INDEX "InventoryCostLayer_productId_receivedAt_idx" ON "InventoryCostLayer"("productId", "receivedAt");
ALTER TABLE "InventoryCostLayer" ADD CONSTRAINT "InventoryCostLayer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "InventoryProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryCostConsumption" (
  "id" TEXT NOT NULL,
  "movementId" TEXT NOT NULL,
  "layerId" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "unitCost" DECIMAL(18,4) NOT NULL,
  CONSTRAINT "InventoryCostConsumption_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InventoryCostConsumption_movementId_idx" ON "InventoryCostConsumption"("movementId");
CREATE INDEX "InventoryCostConsumption_layerId_idx" ON "InventoryCostConsumption"("layerId");
ALTER TABLE "InventoryCostConsumption" ADD CONSTRAINT "InventoryCostConsumption_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "InventoryMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCostConsumption" ADD CONSTRAINT "InventoryCostConsumption_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "InventoryCostLayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FixedAsset" (
  "id" TEXT NOT NULL,
  "assetNumber" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "accountCode" TEXT NOT NULL DEFAULT '1-2001',
  "acquisitionDate" TIMESTAMP(3),
  "acquisitionCost" DECIMAL(18,2) NOT NULL,
  "locationName" TEXT,
  "availableForUseDate" TIMESTAMP(3),
  "usefulLifeMonths" INTEGER,
  "residualValue" DECIMAL(18,2),
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "sourceType" TEXT,
  "sourceId" TEXT,
  "notes" TEXT,
  "createdByUserId" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FixedAsset_assetNumber_key" ON "FixedAsset"("assetNumber");
CREATE UNIQUE INDEX "FixedAsset_sourceType_sourceId_key" ON "FixedAsset"("sourceType", "sourceId");
CREATE INDEX "FixedAsset_status_idx" ON "FixedAsset"("status");
