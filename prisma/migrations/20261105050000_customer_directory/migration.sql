-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "location" TEXT,
    "shippingMethod" TEXT,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "lastOrderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_nameKey_key" ON "Customer"("nameKey");

-- CreateIndex
CREATE INDEX "Customer_lastOrderAt_idx" ON "Customer"("lastOrderAt");

-- Isi dari penjualan lama: data terbaru yang tidak kosong per nama customer (Walk In dilewati).
INSERT INTO "Customer" ("id", "nameKey", "name", "phone", "location", "shippingMethod", "orderCount", "lastOrderAt", "updatedAt")
SELECT
    'cus_' || md5(s.key),
    s.key,
    (array_agg(btrim(s."customerName") ORDER BY s.at DESC))[1],
    (array_agg(btrim(s."customerPhone") ORDER BY s.at DESC) FILTER (WHERE btrim(COALESCE(s."customerPhone", '')) <> ''))[1],
    (array_agg(btrim(s."customerLocation") ORDER BY s.at DESC) FILTER (WHERE btrim(COALESCE(s."customerLocation", '')) <> ''))[1],
    (array_agg(btrim(s."shippingMethod") ORDER BY s.at DESC) FILTER (WHERE btrim(COALESCE(s."shippingMethod", '')) <> ''))[1],
    COUNT(*)::int,
    MAX(s.at),
    CURRENT_TIMESTAMP
FROM (
    SELECT lower(regexp_replace(btrim("customerName"), '\s+', ' ', 'g')) AS key,
           COALESCE("transactionAt", "saleDate") AS at,
           "customerName", "customerPhone", "customerLocation", "shippingMethod"
    FROM "SalesRecord"
    WHERE "approvalStatus" <> 'cancelled' AND btrim(COALESCE("customerName", '')) <> ''
) s
WHERE s.key <> 'walk in'
GROUP BY s.key;
