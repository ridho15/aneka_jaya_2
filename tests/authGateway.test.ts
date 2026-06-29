import { describe, expect, it } from "vitest";
import { createAuthGatewayServer } from "@/scripts/auth-gateway.mjs";
import { hashPassword, verifyPassword } from "@/scripts/auth-password.mjs";

describe("temporary auth gateway", () => {
  it("hashes and verifies gateway passwords", () => {
    const encoded = hashPassword("safe-password");

    expect(verifyPassword("safe-password", encoded)).toBe(true);
    expect(verifyPassword("wrong-password", encoded)).toBe(false);
    expect(encoded).toMatch(/^scrypt\$/);
  });

  it("creates a gateway server when required config is complete", () => {
    const gateway = createAuthGatewayServer({
      AUTH_GATEWAY_APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_TRUSTED_HEADER_SECRET: "trusted-secret",
      AUTH_GATEWAY_SESSION_SECRET: "session-secret",
      AUTH_GATEWAY_USERS: JSON.stringify([
        { username: "owner", externalId: "owner-sso", name: "Owner", passwordHash: hashPassword("password") }
      ])
    });

    expect(gateway).toBeDefined();
    gateway.close();
  });

  it("rejects missing gateway users config", () => {
    expect(() => createAuthGatewayServer({
      AUTH_GATEWAY_APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_TRUSTED_HEADER_SECRET: "trusted-secret",
      AUTH_GATEWAY_SESSION_SECRET: "session-secret",
      AUTH_GATEWAY_USERS: ""
    })).toThrow("AUTH_GATEWAY_USERS wajib diisi");
  });
});
