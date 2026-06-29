import { describe, expect, it, vi } from "vitest";
import { appUrl, runAuthSmoke } from "@/scripts/smoke-auth.mjs";

const env = {
  APP_BASE_URL: "https://app.example.test",
  SMOKE_LOGIN_IDENTIFIER: "owner",
  SMOKE_LOGIN_PASSWORD: "secret123"
};

function response(status: number, body = "", headers?: Record<string, string>) {
  return new Response(body, { status, headers });
}

describe("auth smoke script", () => {
  it("builds app URLs", () => {
    expect(appUrl("/login", env)).toBe("https://app.example.test/login");
  });

  it("runs the expected smoke checks", async () => {
    const fetchImpl = vi.fn(async (url: string, options?: RequestInit) => {
      const headers = new Headers(options?.headers);
      const cookie = headers.get("cookie");
      if (url.endsWith("/dashboard") && !cookie) return response(307, "", { location: "https://app.example.test/login" });
      if (url.endsWith("/api/auth/login")) return response(200, `{"success":true,"sessionCookie":"aneka_jaya_session=token; HttpOnly"}`);
      if (url.endsWith("/login")) return response(200, `<label>Email atau username</label><label>Password</label>`);
      if (url.endsWith("/settings/users") && cookie) return response(200, "Users");
      if (url === "https://app.example.test/") return response(200, "Masuk ke sistem operasional");
      return response(404);
    });

    await expect(runAuthSmoke(env, fetchImpl as unknown as typeof fetch)).resolves.toMatchObject({
      ok: true,
      checks: expect.arrayContaining(["no-session-redirect-login", "login-page-internal-form", "login-success-session-cookie", "owner-db-role-wins"])
    });
  });

  it("requires smoke env", async () => {
    await expect(runAuthSmoke({}, vi.fn() as unknown as typeof fetch)).rejects.toThrow("Smoke auth env belum lengkap");
  });
});
