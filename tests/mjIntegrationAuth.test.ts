import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256 } from "@/lib/integrations/mj/hash";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), rateUpsert: vi.fn(), tokenUpdate: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  integrationToken: { findMany: mocks.findMany, update: mocks.tokenUpdate },
  integrationRateLimit: { upsert: mocks.rateUpsert }
} }));

import { authenticateMjRequest } from "@/lib/integrations/mj/auth";

const raw = "slm_sandbox_ab12_secret-value";
function candidate(overrides: Record<string, unknown> = {}) {
  return { id: "token-1", clientId: "client-1", tokenHash: sha256(raw), prefix: "ab12", environment: "sandbox", isActive: true, expiresAt: null, revokedAt: null, client: { id: "client-1", code: "mj-sandbox", environment: "sandbox", isActive: true }, ...overrides };
}

describe("MJ bearer authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MJ_INTEGRATION_ENVIRONMENT = "sandbox";
    mocks.findMany.mockResolvedValue([candidate()]);
    mocks.rateUpsert.mockResolvedValue({ requestCount: 1 });
    mocks.tokenUpdate.mockResolvedValue({});
  });

  it("authenticates a matching active token and records usage", async () => {
    await expect(authenticateMjRequest(new Request("http://local", { headers: { authorization: `Bearer ${raw}` } }), "mutation")).resolves.toMatchObject({ clientId: "client-1", environment: "sandbox" });
    expect(mocks.tokenUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "token-1" } }));
  });

  it.each([
    ["revoked", { revokedAt: new Date() }],
    ["expired", { expiresAt: new Date("2020-01-01") }],
    ["inactive", { isActive: false }],
    ["wrong environment", { environment: "production", client: { id: "client-1", code: "mj-production", environment: "production", isActive: true } }]
  ])("rejects a %s token", async (_label, overrides) => {
    mocks.findMany.mockResolvedValue([candidate(overrides)]);
    await expect(authenticateMjRequest(new Request("http://local", { headers: { authorization: `Bearer ${raw}` } }), "read")).rejects.toMatchObject({ code: "AUTH_INVALID", status: 401 });
  });

  it("rejects requests over the configured mutation rate", async () => {
    process.env.MJ_RATE_LIMIT_MUTATION_PER_MINUTE = "1";
    mocks.rateUpsert.mockResolvedValue({ requestCount: 2 });
    await expect(authenticateMjRequest(new Request("http://local", { headers: { authorization: `Bearer ${raw}` } }), "mutation")).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
    delete process.env.MJ_RATE_LIMIT_MUTATION_PER_MINUTE;
  });
});
