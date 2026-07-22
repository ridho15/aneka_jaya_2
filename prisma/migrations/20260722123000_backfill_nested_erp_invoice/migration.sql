UPDATE "SalesRecord"
SET "erpInvoiceId" = CASE
  WHEN COALESCE("erpSyncResponse"->'invoices'->0->>'id', "erpSyncResponse"->'data'->'invoices'->0->>'id') ~ '^[0-9]+$'
  THEN COALESCE("erpSyncResponse"->'invoices'->0->>'id', "erpSyncResponse"->'data'->'invoices'->0->>'id')::INTEGER
  ELSE "erpInvoiceId"
END,
"erpInvoiceNumber" = COALESCE(
  "erpInvoiceNumber",
  "erpSyncResponse"->'invoices'->0->>'invoice_number',
  "erpSyncResponse"->'data'->'invoices'->0->>'invoice_number'
)
WHERE "erpSyncResponse" IS NOT NULL;
