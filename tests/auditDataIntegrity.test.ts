import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  prisma: { auditLog: { findMany: vi.fn() } }
}));

vi.mock("node:fs/promises", () => ({
  readFile: mocks.readFile,
  mkdir: vi.fn(),
  writeFile: vi.fn()
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));

import { listAudit } from "@/lib/audit/store";

describe("audit data integrity", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "development");
    mocks.readFile.mockReset();
  });

  it("does not expose historical simulated audit records", async () => {
    mocks.readFile.mockResolvedValue(JSON.stringify([
      { id: "real", entityType: "sales", entityId: "1", action: "create", reason: "Invoice Penjualan", userId: "1", userNameSnapshot: "Admin", userRoleSnapshot: "OWNER", createdAt: "2026-06-01T00:00:00.000Z" },
      { id: "simulated", entityType: "product", entityId: "2", action: "update", reason: "Master Barang - Mock", userId: "1", userNameSnapshot: "Admin", userRoleSnapshot: "OWNER", createdAt: "2026-06-01T00:00:00.000Z" }
    ]));

    await expect(listAudit({ role: "OWNER" })).resolves.toEqual([
      expect.objectContaining({ id: "real" })
    ]);
  });
});
