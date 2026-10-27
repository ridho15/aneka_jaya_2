-- CreateEnum
CREATE TYPE "SalesReturnStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesReturnRefundMethod" AS ENUM ('REDUCE_RECEIVABLE', 'REFUND_CASH');

-- AlterTable
ALTER TABLE "SalesRecord" ADD COLUMN     "cogsJournalEntryId" TEXT,
ADD COLUMN     "journalEntryId" TEXT;

-- CreateTable
CREATE TABLE "SalesReturn" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "salesRecordId" TEXT NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL,
    "customerName" TEXT NOT NULL,
    "refundMethod" "SalesReturnRefundMethod" NOT NULL DEFAULT 'REDUCE_RECEIVABLE',
    "rekeningAccountId" TEXT,
    "subtotalAmount" DECIMAL(18,2) NOT NULL,
    "totalCostPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "SalesReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByNameSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesReturnItem" (
    "id" TEXT NOT NULL,
    "salesReturnId" TEXT NOT NULL,
    "salesRecordItemId" TEXT,
    "productRef" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'PCS',
    "quantity" DECIMAL(18,2) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "unitCostPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "totalCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "reason" TEXT,

    CONSTRAINT "SalesReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesReturn_returnNumber_key" ON "SalesReturn"("returnNumber");

-- CreateIndex
CREATE INDEX "SalesReturn_salesRecordId_idx" ON "SalesReturn"("salesRecordId");

-- CreateIndex
CREATE INDEX "SalesReturn_returnDate_idx" ON "SalesReturn"("returnDate");

-- CreateIndex
CREATE INDEX "SalesReturn_status_idx" ON "SalesReturn"("status");

-- CreateIndex
CREATE INDEX "SalesReturn_rekeningAccountId_idx" ON "SalesReturn"("rekeningAccountId");

-- CreateIndex
CREATE INDEX "SalesReturn_journalEntryId_idx" ON "SalesReturn"("journalEntryId");

-- CreateIndex
CREATE INDEX "SalesReturnItem_salesReturnId_idx" ON "SalesReturnItem"("salesReturnId");

-- CreateIndex
CREATE INDEX "SalesReturnItem_productRef_idx" ON "SalesReturnItem"("productRef");

-- CreateIndex
CREATE INDEX "SalesRecord_journalEntryId_idx" ON "SalesRecord"("journalEntryId");

-- CreateIndex
CREATE INDEX "SalesRecord_cogsJournalEntryId_idx" ON "SalesRecord"("cogsJournalEntryId");

-- AddForeignKey
ALTER TABLE "SalesRecord" ADD CONSTRAINT "SalesRecord_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRecord" ADD CONSTRAINT "SalesRecord_cogsJournalEntryId_fkey" FOREIGN KEY ("cogsJournalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_salesRecordId_fkey" FOREIGN KEY ("salesRecordId") REFERENCES "SalesRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_rekeningAccountId_fkey" FOREIGN KEY ("rekeningAccountId") REFERENCES "RekeningAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "SalesReturnItem_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "SalesReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
