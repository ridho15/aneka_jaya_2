import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { anikaRequest } from "@/lib/api/anikaClient";

describe("anikaRequest error contract", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reports missing ERP configuration without making a request", async () => {
    vi.stubEnv("ANIKA_ERP_API_BASE_URL", "");
    vi.stubEnv("ANIKA_ERP_API_TOKEN", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(anikaRequest("/products")).resolves.toMatchObject({ success: false, code: "ERP_NOT_CONFIGURED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requires a fresh login when Anika auth has no ERP token cookie", async () => {
    vi.stubEnv("AUTH_PROVIDER", "anika_erp");
    vi.stubEnv("ANIKA_ERP_API_BASE_URL", "https://erp.example.test");
    vi.stubEnv("ANIKA_ERP_API_TOKEN", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(anikaRequest("/products")).resolves.toMatchObject({ success: false, code: "ERP_SESSION_REQUIRED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([401, 403])("maps ERP status %s to a safe authentication error", async (status) => {
    vi.stubEnv("ANIKA_ERP_API_BASE_URL", "https://erp.example.test");
    vi.stubEnv("ANIKA_ERP_API_TOKEN", "secret-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ message: "sensitive upstream detail" }), { status }));

    const result = await anikaRequest("/products");

    expect(result).toEqual({ success: false, message: "Akses ke ERP ditolak. Hubungi Super Admin.", code: "ERP_AUTH", details: undefined });
    expect(JSON.stringify(result)).not.toContain("sensitive upstream detail");
  });

  it("maps other non-success responses to an upstream error", async () => {
    vi.stubEnv("ANIKA_ERP_API_BASE_URL", "https://erp.example.test");
    vi.stubEnv("ANIKA_ERP_API_TOKEN", "secret-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));

    await expect(anikaRequest("/products")).resolves.toMatchObject({ success: false, code: "ERP_UPSTREAM" });
  });

  it("maps aborts to a timeout error", async () => {
    vi.stubEnv("ANIKA_ERP_API_BASE_URL", "https://erp.example.test");
    vi.stubEnv("ANIKA_ERP_API_TOKEN", "secret-token");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("Aborted", "AbortError"));

    await expect(anikaRequest("/products")).resolves.toMatchObject({ success: false, code: "ERP_TIMEOUT" });
  });
});
