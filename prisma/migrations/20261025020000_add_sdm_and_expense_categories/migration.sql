-- CreateEnum
CREATE TYPE "LoanType" AS ENUM ('KASBON', 'UANG_MUKA');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'PAID', 'SETTLED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ExpenseRecord" ADD COLUMN     "categoryCode" TEXT NOT NULL DEFAULT 'operational_expense',
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "employeeId" TEXT,
ADD COLUMN     "journalEntryId" TEXT,
ADD COLUMN     "postingStatus" TEXT NOT NULL DEFAULT 'unposted',
ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "salaryPeriod" TEXT;

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "nik" TEXT,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "managerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLoan" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "expenseRecordId" TEXT NOT NULL,
    "loanType" "LoanType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "remainingAmount" DECIMAL(18,2) NOT NULL,
    "disbursedDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "purpose" TEXT NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLoanPayment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "rekeningId" TEXT,
    "rekeningNameSnapshot" TEXT,
    "payrollReference" TEXT,
    "notes" TEXT,
    "attachmentUrl" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByNameSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeLoanPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalAdvanceSettlement" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "settlementDate" TIMESTAMP(3) NOT NULL,
    "actualExpenseAmount" DECIMAL(18,2) NOT NULL,
    "refundAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "refundRekeningId" TEXT,
    "refundRekeningSnapshot" TEXT,
    "notes" TEXT,
    "attachmentUrl" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByNameSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalAdvanceSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSalaryPayment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "expenseRecordId" TEXT NOT NULL,
    "periodMonth" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "amountPaid" DECIMAL(18,2) NOT NULL,
    "rekeningId" TEXT NOT NULL,
    "rekeningNameSnapshot" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByNameSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeSalaryPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_nik_key" ON "Employee"("nik");

-- CreateIndex
CREATE INDEX "Employee_isActive_idx" ON "Employee"("isActive");

-- CreateIndex
CREATE INDEX "Employee_department_idx" ON "Employee"("department");

-- CreateIndex
CREATE INDEX "Employee_managerId_idx" ON "Employee"("managerId");

-- CreateIndex
CREATE INDEX "EmployeeLoan_employeeId_idx" ON "EmployeeLoan"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeLoan_expenseRecordId_idx" ON "EmployeeLoan"("expenseRecordId");

-- CreateIndex
CREATE INDEX "EmployeeLoan_loanType_status_idx" ON "EmployeeLoan"("loanType", "status");

-- CreateIndex
CREATE INDEX "EmployeeLoan_dueDate_idx" ON "EmployeeLoan"("dueDate");

-- CreateIndex
CREATE INDEX "EmployeeLoanPayment_loanId_idx" ON "EmployeeLoanPayment"("loanId");

-- CreateIndex
CREATE INDEX "EmployeeLoanPayment_employeeId_idx" ON "EmployeeLoanPayment"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeLoanPayment_paymentDate_idx" ON "EmployeeLoanPayment"("paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalAdvanceSettlement_loanId_key" ON "OperationalAdvanceSettlement"("loanId");

-- CreateIndex
CREATE INDEX "OperationalAdvanceSettlement_settlementDate_idx" ON "OperationalAdvanceSettlement"("settlementDate");

-- CreateIndex
CREATE INDEX "EmployeeSalaryPayment_employeeId_idx" ON "EmployeeSalaryPayment"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeSalaryPayment_expenseRecordId_idx" ON "EmployeeSalaryPayment"("expenseRecordId");

-- CreateIndex
CREATE INDEX "EmployeeSalaryPayment_periodMonth_idx" ON "EmployeeSalaryPayment"("periodMonth");

-- CreateIndex
CREATE INDEX "EmployeeSalaryPayment_paymentDate_idx" ON "EmployeeSalaryPayment"("paymentDate");

-- CreateIndex
CREATE INDEX "ExpenseRecord_categoryCode_idx" ON "ExpenseRecord"("categoryCode");

-- CreateIndex
CREATE INDEX "ExpenseRecord_employeeId_idx" ON "ExpenseRecord"("employeeId");

-- CreateIndex
CREATE INDEX "ExpenseRecord_salaryPeriod_idx" ON "ExpenseRecord"("salaryPeriod");

-- AddForeignKey
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLoan" ADD CONSTRAINT "EmployeeLoan_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLoan" ADD CONSTRAINT "EmployeeLoan_expenseRecordId_fkey" FOREIGN KEY ("expenseRecordId") REFERENCES "ExpenseRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLoanPayment" ADD CONSTRAINT "EmployeeLoanPayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "EmployeeLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLoanPayment" ADD CONSTRAINT "EmployeeLoanPayment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAdvanceSettlement" ADD CONSTRAINT "OperationalAdvanceSettlement_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "EmployeeLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalaryPayment" ADD CONSTRAINT "EmployeeSalaryPayment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalaryPayment" ADD CONSTRAINT "EmployeeSalaryPayment_expenseRecordId_fkey" FOREIGN KEY ("expenseRecordId") REFERENCES "ExpenseRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
