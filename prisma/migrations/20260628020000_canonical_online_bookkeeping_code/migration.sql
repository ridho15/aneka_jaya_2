DO $$
DECLARE
  canonical_id TEXT;
  duplicate_id TEXT;
BEGIN
  SELECT id INTO canonical_id
  FROM "BookkeepingType"
  WHERE code = 'Online'
  ORDER BY CASE WHEN id = 'ONLINE' THEN 0 ELSE 1 END, id
  LIMIT 1;

  IF canonical_id IS NULL THEN
    SELECT id INTO canonical_id
    FROM "BookkeepingType"
    WHERE code = 'ONLINE'
    ORDER BY CASE WHEN id = 'ONLINE' THEN 0 ELSE 1 END, id
    LIMIT 1;
  END IF;

  IF canonical_id IS NULL THEN
    INSERT INTO "BookkeepingType" (id, code, name, "isActive", "sortOrder", "createdAt", "updatedAt")
    VALUES ('ONLINE', 'ONLINE', 'Online', true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    canonical_id := 'ONLINE';
  END IF;

  FOR duplicate_id IN
    SELECT id
    FROM "BookkeepingType"
    WHERE code IN ('Online', 'ONLINE')
      AND id <> canonical_id
  LOOP
    INSERT INTO "RekeningAccountBookkeepingType" ("rekeningAccountId", "bookkeepingTypeId")
    SELECT "rekeningAccountId", canonical_id
    FROM "RekeningAccountBookkeepingType"
    WHERE "bookkeepingTypeId" = duplicate_id
    ON CONFLICT DO NOTHING;

    DELETE FROM "RekeningAccountBookkeepingType"
    WHERE "bookkeepingTypeId" = duplicate_id;

    UPDATE "SalesRecord"
    SET "tipeId" = canonical_id
    WHERE "tipeId" = duplicate_id;

    UPDATE "TempoReceivable"
    SET "tipeId" = canonical_id
    WHERE "tipeId" = duplicate_id;

    DELETE FROM "BookkeepingType"
    WHERE id = duplicate_id;
  END LOOP;

  UPDATE "BookkeepingType"
  SET code = 'ONLINE',
      name = 'Online',
      "sortOrder" = 3,
      "isActive" = true,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE id = canonical_id;
END $$;
