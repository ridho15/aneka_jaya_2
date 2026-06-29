-- Normalize sales line items and rekening-to-tipe assignments.

ALTER TABLE "BookkeepingType" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

INSERT INTO "BookkeepingType" ("id", "code", "name", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('W', 'W', 'W', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('SLM', 'SLM', 'SLM', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ONLINE', 'Online', 'Online', true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "BookkeepingType" ("id", "code", "name", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT DISTINCT tipe_id, tipe_id, tipe_id, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "RekeningAccount", unnest("tipeIds") AS tipe_id
WHERE tipe_id IS NOT NULL AND tipe_id <> ''
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "SalesRecordItem" (
    "id" TEXT NOT NULL,
    "salesRecordId" TEXT NOT NULL,
    "productRef" TEXT NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "SalesRecordItem_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SalesRecordItem" ("id", "salesRecordId", "productRef", "quantity", "unitPrice", "discount", "sortOrder")
SELECT
  md5(sr."id" || ':' || item.ordinality::text),
  sr."id",
  COALESCE(item.value->>'productRef', ''),
  COALESCE(NULLIF(item.value->>'quantity', '')::DECIMAL(18,2), 0),
  COALESCE(NULLIF(item.value->>'unitPrice', '')::DECIMAL(18,2), 0),
  COALESCE(NULLIF(item.value->>'discount', '')::DECIMAL(18,2), 0),
  item.ordinality::INTEGER - 1
FROM "SalesRecord" sr
CROSS JOIN LATERAL jsonb_array_elements(sr."items") WITH ORDINALITY AS item(value, ordinality)
WHERE jsonb_typeof(sr."items") = 'array';

CREATE INDEX "SalesRecordItem_salesRecordId_idx" ON "SalesRecordItem"("salesRecordId");
CREATE INDEX "SalesRecordItem_productRef_idx" ON "SalesRecordItem"("productRef");

ALTER TABLE "SalesRecordItem"
ADD CONSTRAINT "SalesRecordItem_salesRecordId_fkey"
FOREIGN KEY ("salesRecordId") REFERENCES "SalesRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesRecord" DROP COLUMN "items";

CREATE TABLE "RekeningAccountBookkeepingType" (
    "rekeningAccountId" TEXT NOT NULL,
    "bookkeepingTypeId" TEXT NOT NULL,

    CONSTRAINT "RekeningAccountBookkeepingType_pkey" PRIMARY KEY ("rekeningAccountId", "bookkeepingTypeId")
);

INSERT INTO "RekeningAccountBookkeepingType" ("rekeningAccountId", "bookkeepingTypeId")
SELECT DISTINCT r."id", tipe_id
FROM "RekeningAccount" r, unnest(r."tipeIds") AS tipe_id
WHERE tipe_id IS NOT NULL AND tipe_id <> ''
ON CONFLICT DO NOTHING;

CREATE INDEX "RekeningAccountBookkeepingType_bookkeepingTypeId_idx" ON "RekeningAccountBookkeepingType"("bookkeepingTypeId");

ALTER TABLE "RekeningAccountBookkeepingType"
ADD CONSTRAINT "RekeningAccountBookkeepingType_rekeningAccountId_fkey"
FOREIGN KEY ("rekeningAccountId") REFERENCES "RekeningAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RekeningAccountBookkeepingType"
ADD CONSTRAINT "RekeningAccountBookkeepingType_bookkeepingTypeId_fkey"
FOREIGN KEY ("bookkeepingTypeId") REFERENCES "BookkeepingType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RekeningAccount" DROP COLUMN "tipeIds";
