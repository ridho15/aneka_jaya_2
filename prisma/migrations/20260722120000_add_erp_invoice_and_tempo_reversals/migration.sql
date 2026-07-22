ALTER TABLE "SalesRecord"
ADD COLUMN "erpInvoiceId" INTEGER,
ADD COLUMN "erpInvoiceNumber" TEXT;

CREATE INDEX "SalesRecord_erpInvoiceNumber_idx" ON "SalesRecord"("erpInvoiceNumber");

CREATE TABLE "TempoPaymentReversal" (
  "id" TEXT NOT NULL,
  "tempoPaymentId" TEXT NOT NULL,
  "reversalDate" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "erpStatus" TEXT NOT NULL DEFAULT 'not_required',
  "erpReference" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdByNameSnapshot" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TempoPaymentReversal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TempoPaymentReversal_tempoPaymentId_idx" ON "TempoPaymentReversal"("tempoPaymentId");
CREATE INDEX "TempoPaymentReversal_reversalDate_idx" ON "TempoPaymentReversal"("reversalDate");

ALTER TABLE "TempoPaymentReversal"
ADD CONSTRAINT "TempoPaymentReversal_tempoPaymentId_fkey"
FOREIGN KEY ("tempoPaymentId") REFERENCES "TempoPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "SalesRecord"
SET "erpInvoiceId" = CASE
  WHEN COALESCE("erpSyncResponse"->>'invoice_id', "erpSyncResponse"->'data'->>'invoice_id') ~ '^[0-9]+$'
  THEN COALESCE("erpSyncResponse"->>'invoice_id', "erpSyncResponse"->'data'->>'invoice_id')::INTEGER
  ELSE NULL
END,
"erpInvoiceNumber" = COALESCE(
  "erpSyncResponse"->>'invoice_number',
  "erpSyncResponse"->'invoice'->>'invoice_number',
  "erpSyncResponse"->'data'->>'invoice_number',
  "erpSyncResponse"->'data'->'invoice'->>'invoice_number',
  "erpSyncResponse"->>'slm_invoice_number',
  "erpSyncResponse"->'data'->>'slm_invoice_number'
)
WHERE "erpSyncResponse" IS NOT NULL;
