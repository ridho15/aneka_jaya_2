import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  anikaRequest: vi.fn()
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/api/anikaClient", () => ({
  anikaRequest: mocks.anikaRequest
}));

import { listErpPaginated } from "@/lib/api/pagination";

describe("ERP pagination helper", () => {
  beforeEach(() => {
    mocks.anikaRequest.mockReset();
  });

  it("loads pages until the last short page", async () => {
    mocks.anikaRequest
      .mockResolvedValueOnce({ success: true, data: { data: Array.from({ length: 2 }, (_, index) => ({ id: index + 1 })) } })
      .mockResolvedValueOnce({ success: true, data: { data: [{ id: 3 }] } });

    await expect(listErpPaginated("/products", { perPage: 2 })).resolves.toEqual({
      success: true,
      data: [{ id: 1 }, { id: 2 }, { id: 3 }]
    });
    expect(mocks.anikaRequest).toHaveBeenNthCalledWith(1, "/products?per_page=2&page=1");
    expect(mocks.anikaRequest).toHaveBeenNthCalledWith(2, "/products?per_page=2&page=2");
  });

  it("preserves extra query parameters", async () => {
    mocks.anikaRequest.mockResolvedValue({ success: true, data: { data: [] } });

    await listErpPaginated("/products", { query: { include_stock: true, search: "abc" } });

    expect(mocks.anikaRequest).toHaveBeenCalledWith("/products?include_stock=true&search=abc&per_page=100&page=1");
  });

  it("uses pagination metadata when available", async () => {
    mocks.anikaRequest
      .mockResolvedValueOnce({ success: true, data: { data: [{ id: 1 }], meta: { current_page: 1, last_page: 2, per_page: 1, total: 2 } } })
      .mockResolvedValueOnce({ success: true, data: { data: [{ id: 2 }], meta: { current_page: 2, last_page: 2, per_page: 1, total: 2 } } });

    await expect(listErpPaginated("/stocks", { perPage: 1, maxPages: 5 })).resolves.toMatchObject({
      success: true,
      data: [{ id: 1 }, { id: 2 }]
    });
    expect(mocks.anikaRequest).toHaveBeenCalledTimes(2);
  });

  it("returns the page error without synthesizing fallback rows", async () => {
    mocks.anikaRequest.mockResolvedValue({ success: false, code: "ERP_TIMEOUT", message: "Koneksi ERP melebihi batas waktu." });

    await expect(listErpPaginated("/stocks")).resolves.toMatchObject({ success: false, code: "ERP_TIMEOUT" });
  });
});
