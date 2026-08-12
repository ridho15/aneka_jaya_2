import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { readOpenApiDocument } from "@/lib/apiDocs/openapi";

function walkRoutes(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) return walkRoutes(fullPath);
    return entry === "route.ts" ? [fullPath] : [];
  });
}

function routeFileToOpenApiPath(filePath: string) {
  const relative = path.relative(path.join(process.cwd(), "app", "api"), path.dirname(filePath));
  return `/api/${relative.split(path.sep).map((segment) => segment.startsWith("[") && segment.endsWith("]") ? `{${segment.slice(1, -1)}}` : segment).join("/")}`;
}

describe("openapi docs", () => {
  it("loads the OpenAPI document", async () => {
    const document = await readOpenApiDocument() as { openapi?: string; paths?: Record<string, unknown>; components?: { schemas?: Record<string, { required?: string[]; properties?: Record<string, unknown> }>; responses?: Record<string, unknown> } };

    expect(document.openapi).toBe("3.1.0");
    expect(document.components?.responses?.Forbidden).toBeTruthy();
    expect(document.paths?.["/api/sales"]).toBeTruthy();
    expect(document.paths?.["/api/print/sales/{id}"]).toBeTruthy();
    expect(document.paths?.["/api/approval/{id}"]).toMatchObject({ post: expect.any(Object) });
    expect(document.components?.schemas?.ExpenseInput?.required).toEqual(expect.arrayContaining(["description", "rekeningNameSnapshot"]));
    expect(document.components?.schemas?.ExpenseInput?.properties).toEqual(expect.objectContaining({ coaId: expect.any(Object), coaNameSnapshot: expect.any(Object) }));
    expect(document.components?.schemas?.MjInvoiceInput).toMatchObject({ discriminator: { propertyName: "processing_mode" } });
    expect(document.components?.schemas?.MjRecordOnlyInput).toBeTruthy();
  });

  it("documents every app/api route", async () => {
    const document = await readOpenApiDocument() as { paths?: Record<string, unknown> };
    const documentedPaths = new Set(Object.keys(document.paths || {}));
    const routePaths = walkRoutes(path.join(process.cwd(), "app", "api")).map(routeFileToOpenApiPath);

    expect(routePaths.filter((routePath) => !documentedPaths.has(routePath))).toEqual([]);
  });
});
