ALTER TABLE "SalesRecord"
  ADD COLUMN "initialPaymentAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "initialPaymentMethod" TEXT,
  ADD COLUMN "initialPaymentRekeningId" TEXT,
  ADD COLUMN "initialPaymentRekeningNameSnapshot" TEXT,
  ADD COLUMN "initialPaymentNotes" TEXT;
