-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('BOOKING', 'BANK_ACTUAL', 'TAX_KMK');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIAL_RECEIVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseInvoiceStatus" AS ENUM ('DRAFT', 'POSTED', 'PARTIAL_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LandedCostType" AS ENUM ('FREIGHT', 'CUSTOMS_DUTY', 'IMPORT_TAX_PPN', 'IMPORT_TAX_PPH22', 'INSURANCE', 'HANDLING', 'OTHER');

-- CreateEnum
CREATE TYPE "LandedCostAllocationMethod" AS ENUM ('BY_VALUE', 'BY_QUANTITY');

-- AlterTable
ALTER TABLE "RekeningAccount" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'IDR',
ADD COLUMN     "openingBalanceDate" TIMESTAMP(3),
ADD COLUMN     "openingBalanceValas" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "openingRate" DECIMAL(18,4) NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "CurrencyRate" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "rateDate" TIMESTAMP(3) NOT NULL,
    "rateType" "RateType" NOT NULL,
    "rate" DECIMAL(18,4) NOT NULL,
    "source" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurrencyRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'ID',
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "expectedDeliveryDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "exchangeRate" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "subtotalOriginal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "subtotalIdr" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalTaxIdr" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmountOriginal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalAmountIdr" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByNameSnapshot" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedByNameSnapshot" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'PCS',
    "quantity" DECIMAL(18,2) NOT NULL,
    "receivedQuantity" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "unitPriceOriginal" DECIMAL(18,4) NOT NULL,
    "unitPriceIdr" DECIMAL(18,2) NOT NULL,
    "totalAmountOriginal" DECIMAL(18,4) NOT NULL,
    "totalAmountIdr" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceipt" (
    "id" TEXT NOT NULL,
    "grnNumber" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "receiptDate" TIMESTAMP(3) NOT NULL,
    "warehouseName" TEXT NOT NULL DEFAULT 'Gudang Utama',
    "notes" TEXT,
    "receivedByUserId" TEXT NOT NULL,
    "receivedByNameSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceiptItem" (
    "id" TEXT NOT NULL,
    "purchaseReceiptId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantityReceived" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "PurchaseReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "supplierInvoiceNumber" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "supplierId" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "exchangeRate" DECIMAL(18,4) NOT NULL,
    "subtotalOriginal" DECIMAL(18,4) NOT NULL,
    "subtotalIdr" DECIMAL(18,2) NOT NULL,
    "landedCostTotalIdr" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmountOriginal" DECIMAL(18,4) NOT NULL,
    "totalAmountIdr" DECIMAL(18,2) NOT NULL,
    "totalPaidOriginal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalPaidIdr" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "PurchaseInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByNameSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandedCostItem" (
    "id" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "costType" "LandedCostType" NOT NULL,
    "isCreditableTax" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "vendorName" TEXT,
    "originalCurrency" TEXT NOT NULL DEFAULT 'IDR',
    "originalAmount" DECIMAL(18,4) NOT NULL,
    "exchangeRate" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "amountIdr" DECIMAL(18,2) NOT NULL,
    "allocationMethod" "LandedCostAllocationMethod" NOT NULL DEFAULT 'BY_VALUE',
    "paymentAccountId" TEXT,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandedCostItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchasePayment" (
    "id" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "rekeningAccountId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountPaidOriginal" DECIMAL(18,4) NOT NULL,
    "paymentRate" DECIMAL(18,4) NOT NULL,
    "invoiceRate" DECIMAL(18,4) NOT NULL,
    "settledPayableIdr" DECIMAL(18,2) NOT NULL,
    "totalPaidIdr" DECIMAL(18,2) NOT NULL,
    "forexDiffIdr" DECIMAL(18,2) NOT NULL,
    "forexAccountCode" TEXT NOT NULL,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByNameSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchasePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CurrencyRate_currency_rateDate_idx" ON "CurrencyRate"("currency", "rateDate");

-- CreateIndex
CREATE UNIQUE INDEX "CurrencyRate_currency_rateDate_rateType_key" ON "CurrencyRate"("currency", "rateDate", "rateType");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE INDEX "Supplier_code_idx" ON "Supplier"("code");

-- CreateIndex
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_orderDate_idx" ON "PurchaseOrder"("orderDate");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_grnNumber_key" ON "PurchaseReceipt"("grnNumber");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_purchaseOrderId_idx" ON "PurchaseReceipt"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_receiptDate_idx" ON "PurchaseReceipt"("receiptDate");

-- CreateIndex
CREATE INDEX "PurchaseReceiptItem_purchaseReceiptId_idx" ON "PurchaseReceiptItem"("purchaseReceiptId");

-- CreateIndex
CREATE INDEX "PurchaseReceiptItem_purchaseOrderItemId_idx" ON "PurchaseReceiptItem"("purchaseOrderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_invoiceNumber_key" ON "PurchaseInvoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_journalEntryId_key" ON "PurchaseInvoice"("journalEntryId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_supplierId_idx" ON "PurchaseInvoice"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_status_idx" ON "PurchaseInvoice"("status");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_invoiceDate_idx" ON "PurchaseInvoice"("invoiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "LandedCostItem_journalEntryId_key" ON "LandedCostItem"("journalEntryId");

-- CreateIndex
CREATE INDEX "LandedCostItem_purchaseInvoiceId_idx" ON "LandedCostItem"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "LandedCostItem_costType_idx" ON "LandedCostItem"("costType");

-- CreateIndex
CREATE UNIQUE INDEX "PurchasePayment_paymentNumber_key" ON "PurchasePayment"("paymentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PurchasePayment_journalEntryId_key" ON "PurchasePayment"("journalEntryId");

-- CreateIndex
CREATE INDEX "PurchasePayment_purchaseInvoiceId_idx" ON "PurchasePayment"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "PurchasePayment_supplierId_idx" ON "PurchasePayment"("supplierId");

-- CreateIndex
CREATE INDEX "PurchasePayment_rekeningAccountId_idx" ON "PurchasePayment"("rekeningAccountId");

-- CreateIndex
CREATE INDEX "PurchasePayment_paymentDate_idx" ON "PurchasePayment"("paymentDate");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_purchaseReceiptId_fkey" FOREIGN KEY ("purchaseReceiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandedCostItem" ADD CONSTRAINT "LandedCostItem_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandedCostItem" ADD CONSTRAINT "LandedCostItem_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "RekeningAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandedCostItem" ADD CONSTRAINT "LandedCostItem_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_rekeningAccountId_fkey" FOREIGN KEY ("rekeningAccountId") REFERENCES "RekeningAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

