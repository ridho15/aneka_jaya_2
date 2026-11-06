-- AlterTable
ALTER TABLE "InventoryProduct" ADD COLUMN "pcsPerUnit" INTEGER,
ADD COLUMN "cbmPerUnit" DECIMAL(18,6),
ADD COLUMN "cbmRateIdr" DECIMAL(18,2);
