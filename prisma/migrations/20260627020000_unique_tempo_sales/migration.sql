-- Prevent duplicate Tempo receivables for the same sales record.
CREATE UNIQUE INDEX "TempoReceivable_salesId_key" ON "TempoReceivable"("salesId");
