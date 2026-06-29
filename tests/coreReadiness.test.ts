import { describe, expect, it } from "vitest";
import { checkCoreReadiness } from "@/scripts/check-core-readiness.mjs";

function fakePrisma(counts: { owner?: number; ownerPassword?: number; tipe?: number; rekening?: number; link?: number }) {
  return {
    $queryRaw: async () => [{ ok: 1 }],
    user: { count: async (args?: { where?: { passwordHash?: { not: null } } }) => args?.where?.passwordHash ? counts.ownerPassword ?? 0 : counts.owner ?? 0 },
    bookkeepingType: { count: async () => counts.tipe ?? 0 },
    rekeningAccount: { count: async () => counts.rekening ?? 0 },
    rekeningAccountBookkeepingType: { count: async () => counts.link ?? 0 }
  };
}

const completeEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/aneka_jaya",
  AUTH_PROVIDER: "local_credentials",
  AUTH_SESSION_SECRET: "secret",
  ANIKA_ERP_API_BASE_URL: "https://erp.example.test",
  ANIKA_ERP_API_TOKEN: "erp-token"
};

describe("core readiness check", () => {
  it("passes when core env and real business master data are available", async () => {
    const result = await checkCoreReadiness(
      completeEnv,
      fakePrisma({ owner: 1, ownerPassword: 1, tipe: 1, rekening: 1, link: 1 }) as never
    );

    expect(result.ok).toBe(true);
    expect(result.failed).toEqual([]);
  });

  it("fails when operational auth and ERP env are incomplete", async () => {
    const result = await checkCoreReadiness(
      { DATABASE_URL: completeEnv.DATABASE_URL, AUTH_PROVIDER: "demo" },
      fakePrisma({ owner: 1, ownerPassword: 1, tipe: 1, rekening: 1, link: 1 }) as never
    );

    expect(result.ok).toBe(false);
    expect(result.failed.map((check) => check.name)).toEqual(expect.arrayContaining([
      "env:AUTH_PROVIDER",
      "env:AUTH_SESSION_SECRET",
      "env:ANIKA_ERP_API_BASE_URL",
      "env:ANIKA_ERP_API_TOKEN"
    ]));
  });

  it("fails when owner or required business master data are missing", async () => {
    const result = await checkCoreReadiness(
      completeEnv,
      fakePrisma({ owner: 0, ownerPassword: 0, tipe: 0, rekening: 0, link: 0 }) as never
    );

    expect(result.ok).toBe(false);
    expect(result.failed.map((check) => check.name)).toEqual(expect.arrayContaining([
      "data:active-owner",
      "data:active-owner-password",
      "data:active-bookkeeping-type",
      "data:active-rekening",
      "data:rekening-tipe-link"
    ]));
  });
});
