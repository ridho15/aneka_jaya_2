ALTER TABLE "RekeningAccount" ADD COLUMN "erpCoaId" TEXT;
ALTER TABLE "RekeningAccount" ADD COLUMN "erpCoaNameSnapshot" TEXT;

ALTER TABLE "SalesRecord" ADD COLUMN "erpPaymentStatus" TEXT NOT NULL DEFAULT 'not_required';
ALTER TABLE "SalesRecord" ADD COLUMN "erpPaymentError" TEXT;
ALTER TABLE "SalesRecord" ADD COLUMN "erpPaymentReference" TEXT;
ALTER TABLE "SalesRecord" ADD COLUMN "erpPaymentSyncedAt" TIMESTAMP(3);
ALTER TABLE "SalesRecord" ADD COLUMN "erpPaymentAttemptedAt" TIMESTAMP(3);

ALTER TABLE "TempoPayment" ADD COLUMN "erpPaymentStatus" TEXT NOT NULL DEFAULT 'not_required';
ALTER TABLE "TempoPayment" ADD COLUMN "erpPaymentError" TEXT;
ALTER TABLE "TempoPayment" ADD COLUMN "erpPaymentReference" TEXT;
ALTER TABLE "TempoPayment" ADD COLUMN "erpPaymentSyncedAt" TIMESTAMP(3);
ALTER TABLE "TempoPayment" ADD COLUMN "erpPaymentAttemptedAt" TIMESTAMP(3);

CREATE INDEX "SalesRecord_erpPaymentStatus_idx" ON "SalesRecord"("erpPaymentStatus");
CREATE INDEX "TempoPayment_erpPaymentStatus_idx" ON "TempoPayment"("erpPaymentStatus");
