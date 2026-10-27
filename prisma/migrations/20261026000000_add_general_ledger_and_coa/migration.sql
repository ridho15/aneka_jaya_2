-- CreateEnum
CREATE TYPE "AccountCategory" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "NormalBalance" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- AlterTable
ALTER TABLE "RekeningAccount" ADD COLUMN "accountId" TEXT;

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "AccountCategory" NOT NULL,
    "normalBalance" "NormalBalance" NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "journalNumber" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "postingType" TEXT NOT NULL,
    "tipeId" TEXT,
    "tipeCodeSnapshot" TEXT,
    "description" TEXT NOT NULL,
    "status" "JournalStatus" NOT NULL DEFAULT 'POSTED',
    "totalDebit" DECIMAL(18,2) NOT NULL,
    "totalCredit" DECIMAL(18,2) NOT NULL,
    "isReversal" BOOLEAN NOT NULL DEFAULT false,
    "reversalOfJournalId" TEXT,
    "reversedByJournalId" TEXT,
    "reversalReason" TEXT,
    "attachmentUrl" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByNameSnapshot" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountCodeSnapshot" TEXT NOT NULL,
    "accountNameSnapshot" TEXT NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "memo" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "periodKey" TEXT NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "closedByNameSnapshot" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("periodKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");
CREATE INDEX "Account_category_idx" ON "Account"("category");
CREATE INDEX "Account_isActive_idx" ON "Account"("isActive");
CREATE INDEX "Account_code_idx" ON "Account"("code");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_journalNumber_key" ON "JournalEntry"("journalNumber");
CREATE UNIQUE INDEX "JournalEntry_reversalOfJournalId_key" ON "JournalEntry"("reversalOfJournalId");
CREATE UNIQUE INDEX "JournalEntry_reversedByJournalId_key" ON "JournalEntry"("reversedByJournalId");
CREATE UNIQUE INDEX "JournalEntry_sourceType_sourceId_postingType_key" ON "JournalEntry"("sourceType", "sourceId", "postingType");
CREATE INDEX "JournalEntry_entryDate_idx" ON "JournalEntry"("entryDate");
CREATE INDEX "JournalEntry_sourceType_sourceId_idx" ON "JournalEntry"("sourceType", "sourceId");
CREATE INDEX "JournalEntry_status_idx" ON "JournalEntry"("status");
CREATE INDEX "JournalEntry_tipeId_idx" ON "JournalEntry"("tipeId");

-- CreateIndex
CREATE INDEX "JournalLine_journalEntryId_idx" ON "JournalLine"("journalEntryId");
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- CreateIndex
CREATE INDEX "RekeningAccount_accountId_idx" ON "RekeningAccount"("accountId");

-- AddForeignKey
ALTER TABLE "RekeningAccount" ADD CONSTRAINT "RekeningAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
