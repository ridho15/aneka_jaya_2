ALTER TABLE "WhatsAppRecipient"
  ADD COLUMN "receivesDailyReport" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "receivesStockAlert" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "receivesTempoReminder" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "WhatsAppMessageLog"
  ADD COLUMN "reportType" TEXT,
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "recipientNameSnapshot" TEXT,
  ADD COLUMN "phoneMaskedSnapshot" TEXT,
  ADD COLUMN "providerMessageId" TEXT,
  ADD COLUMN "errorMessage" TEXT,
  ADD COLUMN "sentAt" TIMESTAMP(3);
