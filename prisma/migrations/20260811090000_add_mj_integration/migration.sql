ALTER TABLE "SalesRecord"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'SLM',
  ADD COLUMN "externalReference" TEXT,
  ADD COLUMN "integrationPayloadHash" TEXT,
  ADD COLUMN "integrationClientId" TEXT,
  ADD COLUMN "externalCustomerId" TEXT,
  ADD COLUMN "erpCustomerId" INTEGER,
  ADD COLUMN "customerSyncStatus" TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN "customerSyncError" TEXT,
  ADD COLUMN "accountSnapshot" JSONB,
  ADD COLUMN "integrationMetadata" JSONB;

ALTER TABLE "TempoPayment" ADD COLUMN "externalPaymentReference" TEXT;

CREATE UNIQUE INDEX "SalesRecord_source_externalReference_key" ON "SalesRecord"("source", "externalReference");
CREATE INDEX "SalesRecord_integrationClientId_idx" ON "SalesRecord"("integrationClientId");
CREATE INDEX "SalesRecord_customerSyncStatus_idx" ON "SalesRecord"("customerSyncStatus");
CREATE UNIQUE INDEX "TempoPayment_externalPaymentReference_key" ON "TempoPayment"("externalPaymentReference");

CREATE TABLE "IntegrationClient" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationClient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntegrationClient_code_key" ON "IntegrationClient"("code");
CREATE INDEX "IntegrationClient_environment_isActive_idx" ON "IntegrationClient"("environment", "isActive");

CREATE TABLE "IntegrationToken" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "rotatedFromId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "IntegrationToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntegrationToken_tokenHash_key" ON "IntegrationToken"("tokenHash");
CREATE INDEX "IntegrationToken_prefix_idx" ON "IntegrationToken"("prefix");
CREATE INDEX "IntegrationToken_clientId_isActive_idx" ON "IntegrationToken"("clientId", "isActive");
ALTER TABLE "IntegrationToken" ADD CONSTRAINT "IntegrationToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "IntegrationClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IntegrationRateLimit" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationRateLimit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntegrationRateLimit_clientId_bucket_windowStart_key" ON "IntegrationRateLimit"("clientId", "bucket", "windowStart");
CREATE INDEX "IntegrationRateLimit_windowStart_idx" ON "IntegrationRateLimit"("windowStart");

CREATE TABLE "IntegrationCustomerMapping" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "externalCustomerId" TEXT NOT NULL,
  "erpCustomerId" INTEGER NOT NULL,
  "customerNameSnapshot" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationCustomerMapping_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntegrationCustomerMapping_source_externalCustomerId_key" ON "IntegrationCustomerMapping"("source", "externalCustomerId");
CREATE INDEX "IntegrationCustomerMapping_erpCustomerId_idx" ON "IntegrationCustomerMapping"("erpCustomerId");

CREATE TABLE "IntegrationStageAttempt" (
  "id" TEXT NOT NULL,
  "salesRecordId" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "httpStatus" INTEGER,
  "response" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "IntegrationStageAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntegrationStageAttempt_salesRecordId_stage_attemptNumber_key" ON "IntegrationStageAttempt"("salesRecordId", "stage", "attemptNumber");
CREATE INDEX "IntegrationStageAttempt_salesRecordId_stage_status_idx" ON "IntegrationStageAttempt"("salesRecordId", "stage", "status");
ALTER TABLE "IntegrationStageAttempt" ADD CONSTRAINT "IntegrationStageAttempt_salesRecordId_fkey" FOREIGN KEY ("salesRecordId") REFERENCES "SalesRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
