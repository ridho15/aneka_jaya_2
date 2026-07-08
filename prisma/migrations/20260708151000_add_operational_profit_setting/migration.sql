INSERT INTO "AppSetting" ("key", "value", "description", "createdAt", "updatedAt")
SELECT
  'operational_gross_profit_percent',
  COALESCE((SELECT "value" FROM "AppSetting" WHERE "key" = 'slm_gross_profit_percent' LIMIT 1), '0'),
  'Persentase estimasi Gross Profit Operasional berbasis omzet.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "AppSetting" WHERE "key" = 'operational_gross_profit_percent'
);
