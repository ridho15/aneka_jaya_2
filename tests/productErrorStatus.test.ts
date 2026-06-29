import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getCurrentRole: vi.fn() }));
vi.mock("@/lib/api/products", () => ({ createProduct: vi.fn(), listProducts: vi.fn() }));

import { productErrorStatus } from "@/lib/api/productErrorStatus";

describe("product API error status", () => {
  it.each([
    ["ERP_SESSION_REQUIRED", 401],
    ["ERP_NOT_CONFIGURED", 503],
    ["ERP_TIMEOUT", 504],
    ["ERP_AUTH", 502],
    ["ERP_UPSTREAM", 502],
    ["ERP_NETWORK", 502]
  ])("maps %s to HTTP %s", (code, status) => {
    expect(productErrorStatus(code)).toBe(status);
  });
});
