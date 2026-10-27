-- CreateEnum
CREATE TYPE "SavingsTransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "SavingsTransactionSource" AS ENUM ('DIRECT_CASH', 'SALARY_DEDUCTION', 'MANUAL_ADJUSTMENT');

-- CreateTable
CREATE TABLE "EmployeeSavings" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeSavings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSavingsTransaction" (
    "id" TEXT NOT NULL,
    "savingsAccountId" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "type" "SavingsTransactionType" NOT NULL,
    "source" "SavingsTransactionSource" NOT NULL DEFAULT 'DIRECT_CASH',
    "amount" DECIMAL(18,2) NOT NULL,
    "balanceAfter" DECIMAL(18,2) NOT NULL,
    "rekeningAccountId" TEXT,
    "journalEntryId" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByNameSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeSavingsTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeSavings_employeeId_key" ON "EmployeeSavings"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeSavings_accountNumber_key" ON "EmployeeSavings"("accountNumber");

-- CreateIndex
CREATE INDEX "EmployeeSavings_employeeId_idx" ON "EmployeeSavings"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeSavingsTransaction_savingsAccountId_idx" ON "EmployeeSavingsTransaction"("savingsAccountId");

-- CreateIndex
CREATE INDEX "EmployeeSavingsTransaction_transactionDate_idx" ON "EmployeeSavingsTransaction"("transactionDate");

-- AddForeignKey
ALTER TABLE "EmployeeSavings" ADD CONSTRAINT "EmployeeSavings_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSavingsTransaction" ADD CONSTRAINT "EmployeeSavingsTransaction_savingsAccountId_fkey" FOREIGN KEY ("savingsAccountId") REFERENCES "EmployeeSavings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSavingsTransaction" ADD CONSTRAINT "EmployeeSavingsTransaction_rekeningAccountId_fkey" FOREIGN KEY ("rekeningAccountId") REFERENCES "RekeningAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSavingsTransaction" ADD CONSTRAINT "EmployeeSavingsTransaction_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
