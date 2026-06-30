import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml") as { load: (source: string) => unknown };

describe("Aneka Jaya ERP OpenAPI contract fixture", () => {
  const spec = yaml.load(readFileSync(path.join(process.cwd(), "tests/fixtures/anekaJayaOpenApi.inventory.yaml"), "utf8")) as {
    paths?: Record<string, Record<string, unknown>>;
    components?: { schemas?: Record<string, { required?: string[] }> };
  };

  it("documents the official stock adjustment endpoint used by the adapter", () => {
    expect(spec.paths?.["/stock-adjustments"]?.post).toBeTruthy();
    expect(spec.components?.schemas?.StockAdjustmentStoreRequest?.required).toEqual(["warehouse_id", "adjustment_type", "reason", "items"]);
  });

  it("does not document direct synced invoice or cash-bank correction endpoints in this fixture", () => {
    const paths = Object.keys(spec.paths || {});
    expect(paths.some((route) => /invoice.*(cancel|void|correction)|cash.*bank.*(cancel|correction)/i.test(route))).toBe(false);
  });
});
