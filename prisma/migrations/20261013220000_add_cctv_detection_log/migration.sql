-- CreateTable
CREATE TABLE "CctvDetectionLog" (
    "id" TEXT NOT NULL,
    "cctvLabelId" INTEGER,
    "invoiceNumber" TEXT,
    "customerName" TEXT,
    "sourceLabel" TEXT,
    "slmReference" TEXT,
    "salesRecordId" TEXT,
    "deliveryOrderId" TEXT,
    "cameraId" INTEGER,
    "cameraName" TEXT,
    "cameraLocation" TEXT,
    "eventType" TEXT NOT NULL DEFAULT 'packing_completed',
    "severity" TEXT NOT NULL DEFAULT 'info',
    "packingStatus" TEXT NOT NULL DEFAULT 'completed',
    "matchStatus" TEXT NOT NULL DEFAULT 'matched',
    "firstSeenAt" TIMESTAMP(3),
    "packingCompletedAt" TIMESTAMP(3),
    "evidenceUrl" TEXT,
    "screenshotPhotoUrl" TEXT,
    "rawPayload" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CctvDetectionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CctvDetectionLog_invoiceNumber_idx" ON "CctvDetectionLog"("invoiceNumber");

-- CreateIndex
CREATE INDEX "CctvDetectionLog_salesRecordId_idx" ON "CctvDetectionLog"("salesRecordId");

-- CreateIndex
CREATE INDEX "CctvDetectionLog_cameraName_idx" ON "CctvDetectionLog"("cameraName");

-- CreateIndex
CREATE INDEX "CctvDetectionLog_eventType_idx" ON "CctvDetectionLog"("eventType");

-- CreateIndex
CREATE INDEX "CctvDetectionLog_createdAt_idx" ON "CctvDetectionLog"("createdAt");

-- AddForeignKey
ALTER TABLE "CctvDetectionLog" ADD CONSTRAINT "CctvDetectionLog_salesRecordId_fkey" FOREIGN KEY ("salesRecordId") REFERENCES "SalesRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
