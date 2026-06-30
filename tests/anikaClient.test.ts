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

    expect(result).toMatchObject({ success: false, message: "Akses ke ERP ditolak. Hubungi Super Admin.", code: "ERP_AUTH", details: { status } });
    expect(JSON.stringify(result)).not.toContain("sensitive upstream detail");
  });

  it("maps validation errors to a specific safe operational error", async () => {
    vi.stubEnv("ANIKA_ERP_API_BASE_URL", "https://erp.example.test");
    vi.stubEnv("ANIKA_ERP_API_TOKEN", "secret-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: "PRODUCT_NOT_FOUND", message: "Produk ABC tidak ditemukan" }), { status: 422 }));

    const result = await anikaRequest("/neo/commands", { method: "POST", body: JSON.stringify({ message_id: "cid-1", token: "must-not-leak" }) });

    expect(result).toMatchObject({
      success: false,
      code: "ERP_VALIDATION",
      message: "ERP menolak payload: Produk ABC tidak ditemukan",
      details: { status: 422, upstreamCode: "PRODUCT_NOT_FOUND", correlationId: "cid-1" }
    });
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  it("maps missing ERP endpoints/resources distinctly", async () => {
    vi.stubEnv("ANIKA_ERP_API_BASE_URL", "https://erp.example.test");
    vi.stubEnv("ANIKA_ERP_API_TOKEN", "secret-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ message: "Route not found" }), { status: 404 }));

    await expect(anikaRequest("/missing")).resolves.toMatchObject({ success: false, code: "ERP_NOT_FOUND", message: "Endpoint/resource ERP tidak ditemukan: Route not found" });
  });

  it("maps service failures to safe upstream errors with truncated details", async () => {
    vi.stubEnv("ANIKA_ERP_API_BASE_URL", "https://erp.example.test");
    vi.stubEnv("ANIKA_ERP_API_TOKEN", "secret-token");
    const longMessage = "x".repeat(500);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ message: longMessage }), { status: 500 }));

    const result = await anikaRequest("/products");

    expect(result).toMatchObject({ success: false, code: "ERP_UPSTREAM" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.message.length).toBeLessThanOrEqual(320);
  });

  it("maps aborts to a timeout error", async () => {
    vi.stubEnv("ANIKA_ERP_API_BASE_URL", "https://erp.example.test");
    vi.stubEnv("ANIKA_ERP_API_TOKEN", "secret-token");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("Aborted", "AbortError"));

    await expect(anikaRequest("/products")).resolves.toMatchObject({ success: false, code: "ERP_TIMEOUT" });
  });
});
