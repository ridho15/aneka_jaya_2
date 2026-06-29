import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(process.cwd(), "prisma", "migrations", "20260628010000_normalize_sales_items_and_rekening_tipe", "migration.sql"),
  "utf8"
);

describe("data normalization migration", () => {
  it("creates normalized sales item rows from legacy SalesRecord.items JSON", () => {
    expect(migration).toContain('CREATE TABLE "SalesRecordItem"');
    expect(migration).toContain('jsonb_array_elements(sr."items")');
    expect(migration).toContain('ALTER TABLE "SalesRecord" DROP COLUMN "items"');
  });

  it("creates a rekening-tipe junction from legacy tipeIds arrays", () => {
    expect(migration).toContain('CREATE TABLE "RekeningAccountBookkeepingType"');
    expect(migration).toContain('unnest(r."tipeIds")');
    expect(migration).toContain('ALTER TABLE "RekeningAccount" DROP COLUMN "tipeIds"');
  });
});
