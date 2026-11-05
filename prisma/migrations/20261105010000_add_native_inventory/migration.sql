-- Native inventory module (gudang/toko, kartu stok, transfer, opname, adjustment)

-- CreateEnum
CREATE TYPE "InventoryLocationType" AS ENUM ('WAREHOUSE', 'STORE');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('INITIAL', 'PURCHASE_RECEIPT', 'TRANSFER_OUT', 'TRANSFER_IN', 'OPNAME', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'SALE_OUT', 'SALE_REVERSAL');

-- CreateEnum
CREATE TYPE "InventoryDocumentStatus" AS ENUM ('POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InventoryTransferStatus" AS ENUM ('IN_TRANSIT', 'RECEIVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "PurchaseReceipt" ADD COLUMN     "inventoryLocationId" TEXT,
ADD COLUMN     "inventoryPostedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InventoryLocation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "InventoryLocationType" NOT NULL DEFAULT 'WAREHOUSE',
    "address" TEXT,
    "phone" TEXT,
    "erpWarehouseId" INTEGER,
    "allowNegative" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryProduct" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "brand" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'PCS',
    "barcode" TEXT,
    "minimumStock" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "costPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sellingPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "erpProductId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "avgCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "movementDate" TIMESTAMP(3) NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "balanceBefore" DECIMAL(18,2) NOT NULL,
    "balanceAfter" DECIMAL(18,2) NOT NULL,
    "unitCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT,
    "referenceNumber" TEXT,
    "idempotencyKey" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransfer" (
    "id" TEXT NOT NULL,
    "transferNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "transferDate" TIMESTAMP(3) NOT NULL,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "status" "InventoryTransferStatus" NOT NULL DEFAULT 'IN_TRANSIT',
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3),
    "receivedByName" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransferItem" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "InventoryTransferItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryOpname" (
    "id" TEXT NOT NULL,
    "opnameNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "opnameDate" TIMESTAMP(3) NOT NULL,
    "locationId" TEXT NOT NULL,
    "status" "InventoryDocumentStatus" NOT NULL DEFAULT 'POSTED',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryOpname_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryOpnameItem" (
    "id" TEXT NOT NULL,
    "opnameId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "systemQty" DECIMAL(18,2) NOT NULL,
    "countedQty" DECIMAL(18,2) NOT NULL,
    "differenceQty" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "InventoryOpnameItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryAdjustment" (
    "id" TEXT NOT NULL,
    "adjustmentNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "adjustmentDate" TIMESTAMP(3) NOT NULL,
    "locationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "InventoryDocumentStatus" NOT NULL DEFAULT 'POSTED',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryAdjustmentItem" (
    "id" TEXT NOT NULL,
    "adjustmentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "unitCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "InventoryAdjustmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLocation_code_key" ON "InventoryLocation"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLocation_erpWarehouseId_key" ON "InventoryLocation"("erpWarehouseId");

-- CreateIndex
CREATE INDEX "InventoryLocation_type_isActive_idx" ON "InventoryLocation"("type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryProduct_sku_key" ON "InventoryProduct"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryProduct_erpProductId_key" ON "InventoryProduct"("erpProductId");

-- CreateIndex
CREATE INDEX "InventoryProduct_name_idx" ON "InventoryProduct"("name");

-- CreateIndex
CREATE INDEX "InventoryProduct_barcode_idx" ON "InventoryProduct"("barcode");

-- CreateIndex
CREATE INDEX "InventoryBalance_locationId_idx" ON "InventoryBalance"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_productId_locationId_key" ON "InventoryBalance"("productId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_idempotencyKey_key" ON "InventoryMovement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_locationId_movementDate_idx" ON "InventoryMovement"("productId", "locationId", "movementDate");

-- CreateIndex
CREATE INDEX "InventoryMovement_locationId_movementDate_idx" ON "InventoryMovement"("locationId", "movementDate");

-- CreateIndex
CREATE INDEX "InventoryMovement_referenceType_referenceNumber_idx" ON "InventoryMovement"("referenceType", "referenceNumber");

-- CreateIndex
CREATE INDEX "InventoryMovement_type_idx" ON "InventoryMovement"("type");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransfer_transferNumber_key" ON "InventoryTransfer"("transferNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransfer_idempotencyKey_key" ON "InventoryTransfer"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryTransfer_fromLocationId_idx" ON "InventoryTransfer"("fromLocationId");

-- CreateIndex
CREATE INDEX "InventoryTransfer_toLocationId_idx" ON "InventoryTransfer"("toLocationId");

-- CreateIndex
CREATE INDEX "InventoryTransfer_transferDate_idx" ON "InventoryTransfer"("transferDate");

-- CreateIndex
CREATE INDEX "InventoryTransferItem_transferId_idx" ON "InventoryTransferItem"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryOpname_opnameNumber_key" ON "InventoryOpname"("opnameNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryOpname_idempotencyKey_key" ON "InventoryOpname"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryOpname_locationId_idx" ON "InventoryOpname"("locationId");

-- CreateIndex
CREATE INDEX "InventoryOpname_opnameDate_idx" ON "InventoryOpname"("opnameDate");

-- CreateIndex
CREATE INDEX "InventoryOpnameItem_opnameId_idx" ON "InventoryOpnameItem"("opnameId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryAdjustment_adjustmentNumber_key" ON "InventoryAdjustment"("adjustmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryAdjustment_idempotencyKey_key" ON "InventoryAdjustment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_locationId_idx" ON "InventoryAdjustment"("locationId");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_adjustmentDate_idx" ON "InventoryAdjustment"("adjustmentDate");

-- CreateIndex
CREATE INDEX "InventoryAdjustmentItem_adjustmentId_idx" ON "InventoryAdjustmentItem"("adjustmentId");

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "InventoryProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "InventoryProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransferItem" ADD CONSTRAINT "InventoryTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "InventoryTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryOpnameItem" ADD CONSTRAINT "InventoryOpnameItem_opnameId_fkey" FOREIGN KEY ("opnameId") REFERENCES "InventoryOpname"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAdjustmentItem" ADD CONSTRAINT "InventoryAdjustmentItem_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "InventoryAdjustment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
