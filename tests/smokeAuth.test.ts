import { describe, expect, it, vi } from "vitest";
import { appUrl, runAuthSmoke, smokeHeaders } from "@/scripts/smoke-auth.mjs";

const env = {
  APP_BASE_URL: "https://app.example.test",
  AUTH_TRUSTED_HEADER_SECRET: "secret",
  AUTH_SSO_LOGIN_URL: "https://sso.example.test/login",
  INITIAL_OWNER_EXTERNAL_ID: "owner-sso"
};

function response(status: number, body = "", headers?: Record<string, string>) {
  return new Response(body, { status, headers });
}

describe("auth smoke script", () => {
  it("builds app URLs and trusted headers", () => {
    expect(appUrl("/login", env)).toBe("https://app.example.test/login");
    expect(smokeHeaders("owner-sso", env)).toMatchObject({
      "x-aneka-auth-secret": "secret",
      "x-aneka-user-id": "owner-sso"
    });
  });

  it("runs the expected smoke checks", async () => {
    const fetchImpl = vi.fn(async (url: string, options?: RequestInit) => {
      const headers = new Headers(options?.headers);
      const userId = headers.get("x-aneka-user-id");
      const secret = headers.get("x-aneka-auth-secret");
      if (url.endsWith("/dashboard") && (!userId || secret === "wrong-secret")) return response(307, "", { location: "https://app.example.test/login" });
      if (url.endsWith("/dashboard") && userId?.startsWith("smoke-unregistered")) return response(307, "", { location: "https://app.example.test/no-access" });
      if (url.endsWith("/login")) return response(200, `<a href="${env.AUTH_SSO_LOGIN_URL}">Masuk</a>`);
      if (url.endsWith("/settings/users")) return response(200, "Users");
      if (url === "https://app.example.test/") return response(200, "Masuk ke sistem operasional");
      return response(404);
    });

    await expect(runAuthSmoke(env, fetchImpl as unknown as typeof fetch)).resolves.toMatchObject({
      ok: true,
      checks: expect.arrayContaining(["no-header-redirect-login", "owner-db-role-wins", "unregistered-root-auth-landing", "unregistered-user-no-access"])
    });
  });

  it("requires smoke env", async () => {
    await expect(runAuthSmoke({}, vi.fn() as unknown as typeof fetch)).rejects.toThrow("Smoke auth env belum lengkap");
  });
});
