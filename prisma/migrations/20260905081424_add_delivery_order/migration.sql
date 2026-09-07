-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'DELIVERY_DRIVER';

-- DropIndex
DROP INDEX "TempoReceivable_salesId_idx";

-- AlterTable
ALTER TABLE "AppSetting" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SalesRecord" ADD COLUMN     "doAssignedUserId" TEXT,
ADD COLUMN     "doAssignedUserName" TEXT,
ADD COLUMN     "doPackingStatus" TEXT NOT NULL DEFAULT 'belum',
ADD COLUMN     "doReceiptPhotoUrl" TEXT,
ADD COLUMN     "doShippingStatus" TEXT NOT NULL DEFAULT 'belum',
ADD COLUMN     "doStatus" TEXT NOT NULL DEFAULT 'belum_selesai',
ADD COLUMN     "doTrackingNumber" TEXT;

-- CreateTable
CREATE TABLE "DeliveryOrder" (
    "id" TEXT NOT NULL,
    "doNumber" TEXT NOT NULL,
    "salesRecordId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'belum_selesai',
    "packingStatus" TEXT NOT NULL DEFAULT 'belum',
    "shippingStatus" TEXT NOT NULL DEFAULT 'belum',
    "assignedUserId" TEXT,
    "assignedUserName" TEXT,
    "assignedAt" TIMESTAMP(3),
    "packedByUserId" TEXT,
    "packedByNameSnapshot" TEXT,
    "packedAt" TIMESTAMP(3),
    "shippedByUserId" TEXT,
    "shippedByNameSnapshot" TEXT,
    "shippedAt" TIMESTAMP(3),
    "receiptPhotoUrl" TEXT,
    "trackingNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryOrderItem" (
    "id" TEXT NOT NULL,
    "deliveryOrderId" TEXT NOT NULL,
    "salesRecordItemId" TEXT NOT NULL,
    "productRef" TEXT NOT NULL,
    "productNameSnapshot" TEXT NOT NULL,
    "warehouseNameSnapshot" TEXT,
    "rackNameSnapshot" TEXT,
    "unitSnapshot" TEXT,
    "quantity" DECIMAL(18,2) NOT NULL,
    "isShipped" BOOLEAN NOT NULL DEFAULT false,
    "shippedQuantity" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "shippedAt" TIMESTAMP(3),

    CONSTRAINT "DeliveryOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_doNumber_key" ON "DeliveryOrder"("doNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_salesRecordId_key" ON "DeliveryOrder"("salesRecordId");

-- CreateIndex
CREATE INDEX "DeliveryOrder_salesRecordId_idx" ON "DeliveryOrder"("salesRecordId");

-- CreateIndex
CREATE INDEX "DeliveryOrder_status_idx" ON "DeliveryOrder"("status");

-- CreateIndex
CREATE INDEX "DeliveryOrder_assignedUserId_idx" ON "DeliveryOrder"("assignedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrderItem_salesRecordItemId_key" ON "DeliveryOrderItem"("salesRecordItemId");

-- CreateIndex
CREATE INDEX "DeliveryOrderItem_deliveryOrderId_idx" ON "DeliveryOrderItem"("deliveryOrderId");

-- CreateIndex
CREATE INDEX "DeliveryOrderItem_salesRecordItemId_idx" ON "DeliveryOrderItem"("salesRecordItemId");

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_salesRecordId_fkey" FOREIGN KEY ("salesRecordId") REFERENCES "SalesRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrderItem" ADD CONSTRAINT "DeliveryOrderItem_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrderItem" ADD CONSTRAINT "DeliveryOrderItem_salesRecordItemId_fkey" FOREIGN KEY ("salesRecordItemId") REFERENCES "SalesRecordItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
