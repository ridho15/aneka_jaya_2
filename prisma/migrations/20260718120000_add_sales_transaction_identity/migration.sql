ALTER TABLE "SalesRecord"
ADD COLUMN "transactionNumber" TEXT,
ADD COLUMN "transactionAt" TIMESTAMP(3),
ADD COLUMN "transactionSequence" INTEGER,
ADD COLUMN "transactionDateKey" TEXT;

CREATE TABLE "DailyTransactionCounter" (
  "dateKey" TEXT NOT NULL,
  "lastValue" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyTransactionCounter_pkey" PRIMARY KEY ("dateKey")
);

CREATE INDEX "SalesRecord_transactionNumber_idx" ON "SalesRecord"("transactionNumber");
CREATE UNIQUE INDEX "SalesRecord_transactionDateKey_transactionSequence_key"
ON "SalesRecord"("transactionDateKey", "transactionSequence");
