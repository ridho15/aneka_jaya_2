import { describe, expect, it } from "vitest";
import { resolveRequestRole } from "@/lib/auth/request";

describe("request auth resolver", () => {
  it("reads demo roles from the role cookie", () => {
    const role = resolveRequestRole(
      { headers: new Headers({ cookie: "aneka_jaya_role=FINANCE" }) },
      { AUTH_PROVIDER: "demo", NODE_ENV: "development" }
    );

    expect(role).toBe("FINANCE");
  });

  it("uses the configured demo default role when no role cookie exists", () => {
    const role = resolveRequestRole(
      { headers: new Headers() },
      { AUTH_PROVIDER: "demo", APP_DEFAULT_ROLE: "VIEWER", NODE_ENV: "development" }
    );

    expect(role).toBe("VIEWER");
  });

  it("defaults demo requests without cookie or APP_DEFAULT_ROLE to viewer", () => {
    const role = resolveRequestRole(
      { headers: new Headers() },
      { AUTH_PROVIDER: "demo", NODE_ENV: "development" }
    );

    expect(role).toBe("VIEWER");
  });

  it("lets a demo role cookie override the safer local default", () => {
    const role = resolveRequestRole(
      { headers: new Headers({ cookie: "aneka_jaya_role=OWNER" }) },
      { AUTH_PROVIDER: "demo", APP_DEFAULT_ROLE: "VIEWER", NODE_ENV: "development" }
    );

    expect(role).toBe("OWNER");
  });

  it("reads trusted-header roles as a development fallback when the shared secret matches", () => {
    const role = resolveRequestRole(
      {
        headers: new Headers({
          "x-aneka-auth-secret": "secret",
          "x-aneka-user-id": "u-1",
          "x-aneka-user-role": "MANAGER"
        })
      },
      { AUTH_PROVIDER: "trusted_header", AUTH_TRUSTED_HEADER_SECRET: "secret", NODE_ENV: "development" }
    );

    expect(role).toBe("MANAGER");
  });

  it("does not trust role headers in production-like trusted-header mode", () => {
    const role = resolveRequestRole(
      {
        headers: new Headers({
          "x-aneka-auth-secret": "secret",
          "x-aneka-user-id": "u-1",
          "x-aneka-user-role": "OWNER"
        })
      },
      { AUTH_PROVIDER: "trusted_header", AUTH_TRUSTED_HEADER_SECRET: "secret", NEXT_PUBLIC_APP_MODE: "production", NODE_ENV: "development" }
    );

    expect(role).toBe("VIEWER");
  });

  it("can allow trusted role headers only for explicit development visual checks", () => {
    const role = resolveRequestRole(
      {
        headers: new Headers({
          "x-aneka-auth-secret": "secret",
          "x-aneka-user-id": "u-1",
          "x-aneka-user-role": "OWNER"
        })
      },
      {
        AUTH_PROVIDER: "trusted_header",
        AUTH_TRUSTED_HEADER_SECRET: "secret",
        AUTH_TRUSTED_HEADER_ALLOW_ROLE_HEADER: "true",
        NEXT_PUBLIC_APP_MODE: "development",
        NODE_ENV: "production"
      }
    );

    expect(role).toBe("OWNER");
  });

  it("falls back to viewer when trusted-header auth is missing or invalid", () => {
    const role = resolveRequestRole(
      { headers: new Headers({ "x-aneka-user-id": "u-1", "x-aneka-user-role": "OWNER" }) },
      { AUTH_PROVIDER: "trusted_header", AUTH_TRUSTED_HEADER_SECRET: "secret", NODE_ENV: "production" }
    );

    expect(role).toBe("VIEWER");
  });

  it("does not default production requests to owner", () => {
    const role = resolveRequestRole(
      { headers: new Headers() },
      { NODE_ENV: "production" }
    );

    expect(role).toBe("VIEWER");
  });

  it("ignores demo role cookies when local credentials auth is active", () => {
    const role = resolveRequestRole(
      { headers: new Headers({ cookie: "aneka_jaya_role=OWNER" }) },
      { AUTH_PROVIDER: "local_credentials", NODE_ENV: "development" }
    );

    expect(role).toBe("VIEWER");
  });

  it("requires a signed session when Anika ERP auth is active", () => {
    const role = resolveRequestRole(
      { headers: new Headers({ cookie: "aneka_jaya_role=OWNER" }) },
      { AUTH_PROVIDER: "anika_erp", NODE_ENV: "development" }
    );

    expect(role).toBe("VIEWER");
  });
});
