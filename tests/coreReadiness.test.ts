import { describe, expect, it } from "vitest";
import { checkCoreReadiness } from "@/scripts/check-core-readiness.mjs";

function fakePrisma(counts: { owner?: number; tipe?: number; rekening?: number; link?: number }) {
  return {
    $queryRaw: async () => [{ ok: 1 }],
    user: { count: async () => counts.owner ?? 0 },
    bookkeepingType: { count: async () => counts.tipe ?? 0 },
    rekeningAccount: { count: async () => counts.rekening ?? 0 },
    rekeningAccountBookkeepingType: { count: async () => counts.link ?? 0 }
  };
}

const completeEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/aneka_jaya",
  AUTH_PROVIDER: "trusted_header",
  AUTH_TRUSTED_HEADER_SECRET: "secret",
  AUTH_SSO_LOGIN_URL: "http://127.0.0.1:3001/login",
  ANIKA_ERP_API_BASE_URL: "https://erp.example.test",
  ANIKA_ERP_API_TOKEN: "erp-token"
};

describe("core readiness check", () => {
  it("passes when core env and real business master data are available", async () => {
    const result = await checkCoreReadiness(
      completeEnv,
      fakePrisma({ owner: 1, tipe: 1, rekening: 1, link: 1 }) as never
    );

    expect(result.ok).toBe(true);
    expect(result.failed).toEqual([]);
  });

  it("fails when operational auth and ERP env are incomplete", async () => {
    const result = await checkCoreReadiness(
      { DATABASE_URL: completeEnv.DATABASE_URL, AUTH_PROVIDER: "demo" },
      fakePrisma({ owner: 1, tipe: 1, rekening: 1, link: 1 }) as never
    );

    expect(result.ok).toBe(false);
    expect(result.failed.map((check) => check.name)).toEqual(expect.arrayContaining([
      "env:AUTH_PROVIDER",
      "env:AUTH_TRUSTED_HEADER_SECRET",
      "env:AUTH_SSO_LOGIN_URL",
      "env:ANIKA_ERP_API_BASE_URL",
      "env:ANIKA_ERP_API_TOKEN"
    ]));
  });

  it("fails when owner or required business master data are missing", async () => {
    const result = await checkCoreReadiness(
      completeEnv,
      fakePrisma({ owner: 0, tipe: 0, rekening: 0, link: 0 }) as never
    );

    expect(result.ok).toBe(false);
    expect(result.failed.map((check) => check.name)).toEqual(expect.arrayContaining([
      "data:active-owner",
      "data:active-bookkeeping-type",
      "data:active-rekening",
      "data:rekening-tipe-link"
    ]));
  });
});
