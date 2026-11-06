-- Pengingat suara packing: penerima WhatsApp dan catatan pengumuman per slot jam.
ALTER TABLE "WhatsAppRecipient" ADD COLUMN "receivesPackingReminder" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "CctvVoiceAnnouncement" (
    "id" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "invoiceCount" INTEGER NOT NULL,
    "salesRecordIds" JSONB NOT NULL,
    "invoices" JSONB NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CctvVoiceAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CctvVoiceAnnouncement_slotKey_key" ON "CctvVoiceAnnouncement"("slotKey");
CREATE INDEX "CctvVoiceAnnouncement_createdAt_idx" ON "CctvVoiceAnnouncement"("createdAt");
