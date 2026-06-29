-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'FINANCE', 'MANAGER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "TempoStatus" AS ENUM ('open', 'paid', 'partial_paid', 'overdue', 'cancelled', 'written_off');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeValue" JSONB,
    "afterValue" JSONB,
    "userId" TEXT NOT NULL,
    "userNameSnapshot" TEXT NOT NULL,
    "userRoleSnapshot" "Role" NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "tipeCodeSnapshot" TEXT,
    "tipeNameSnapshot" TEXT,
    "amount" DECIMAL(18,2),
    "status" "ApprovalStatus" NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByNameSnapshot" TEXT NOT NULL,
    "createdByRoleSnapshot" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "approvedByUserId" TEXT,
    "approvedByNameSnapshot" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedByUserId" TEXT,
    "rejectedByNameSnapshot" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TempoReceivable" (
    "id" TEXT NOT NULL,
    "salesId" TEXT NOT NULL,
    "tipeId" TEXT NOT NULL,
    "tipeCodeSnapshot" TEXT NOT NULL,
    "tipeNameSnapshot" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "originalAmount" DECIMAL(18,2) NOT NULL,
    "paidAmount" DECIMAL(18,2) NOT NULL,
    "remainingAmount" DECIMAL(18,2) NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "TempoStatus" NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByNameSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TempoReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TempoPayment" (
    "id" TEXT NOT NULL,
    "tempoReceivableId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "amountPaid" DECIMAL(18,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "rekeningId" TEXT NOT NULL,
    "rekeningNameSnapshot" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByNameSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TempoPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRecord" (
    "id" TEXT NOT NULL,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "tipeId" TEXT NOT NULL,
    "tipeCodeSnapshot" TEXT NOT NULL,
    "tipeNameSnapshot" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerLocation" TEXT,
    "shippingMethod" TEXT,
    "paymentMethod" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "rekeningId" TEXT,
    "transferAccount" TEXT,
    "notes" TEXT,
    "total" DECIMAL(18,2) NOT NULL,
    "approvalStatus" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByNameSnapshot" TEXT NOT NULL,
    "createdByRoleSnapshot" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "items" JSONB NOT NULL,

    CONSTRAINT "SalesRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookkeepingType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookkeepingType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RekeningAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountNumber" TEXT,
    "bankName" TEXT,
    "tipeIds" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RekeningAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppRecipient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessageLog" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT,
    "recipient" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAlertLog" (
    "id" TEXT NOT NULL,
    "productRef" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "currentQuantity" INTEGER NOT NULL,
    "minimumQuantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "sentTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAlertLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_idx" ON "ApprovalRequest"("status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_module_entityId_idx" ON "ApprovalRequest"("module", "entityId");

-- CreateIndex
CREATE INDEX "TempoReceivable_status_idx" ON "TempoReceivable"("status");

-- CreateIndex
CREATE INDEX "TempoReceivable_dueDate_idx" ON "TempoReceivable"("dueDate");

-- CreateIndex
CREATE INDEX "TempoReceivable_salesId_idx" ON "TempoReceivable"("salesId");

-- CreateIndex
CREATE INDEX "TempoPayment_tempoReceivableId_idx" ON "TempoPayment"("tempoReceivableId");

-- CreateIndex
CREATE INDEX "TempoPayment_paymentDate_idx" ON "TempoPayment"("paymentDate");

-- CreateIndex
CREATE INDEX "SalesRecord_saleDate_idx" ON "SalesRecord"("saleDate");

-- CreateIndex
CREATE INDEX "SalesRecord_approvalStatus_idx" ON "SalesRecord"("approvalStatus");

-- CreateIndex
CREATE INDEX "SalesRecord_customerName_idx" ON "SalesRecord"("customerName");

-- CreateIndex
CREATE UNIQUE INDEX "BookkeepingType_code_key" ON "BookkeepingType"("code");

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_createdAt_idx" ON "WhatsAppMessageLog"("createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_status_idx" ON "WhatsAppMessageLog"("status");

-- CreateIndex
CREATE INDEX "StockAlertLog_productRef_idx" ON "StockAlertLog"("productRef");

-- CreateIndex
CREATE INDEX "StockAlertLog_createdAt_idx" ON "StockAlertLog"("createdAt");

-- AddForeignKey
ALTER TABLE "TempoPayment" ADD CONSTRAINT "TempoPayment_tempoReceivableId_fkey" FOREIGN KEY ("tempoReceivableId") REFERENCES "TempoReceivable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
