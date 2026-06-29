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

import { listAudit, sanitizeAuditValue } from "@/lib/audit/store";

describe("audit data integrity", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "development");
    vi.stubEnv("NODE_ENV", "test");
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

  it("keeps legitimate mock wording visible outside test filtering", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.readFile.mockResolvedValue(JSON.stringify([
      { id: "real-mock-word", entityType: "sales", entityId: "1", action: "create", reason: "Customer Mockingbird", userId: "1", userNameSnapshot: "Admin", userRoleSnapshot: "OWNER", createdAt: "2026-06-01T00:00:00.000Z" }
    ]));

    await expect(listAudit({ role: "OWNER" })).resolves.toEqual([
      expect.objectContaining({ id: "real-mock-word" })
    ]);
  });

  it("sanitizes sensitive audit values before storage", () => {
    const sanitized = sanitizeAuditValue({
      password: "secret123",
      authorization: "Bearer token",
      phoneNumberSnapshot: "6281234567890",
      messageBody: "Laporan rahasia lengkap",
      payload: { token: "nested-token", invoice: "INV-1" },
      syncError: "ERP timeout with detailed internal stack".repeat(10)
    }) as Record<string, unknown>;

    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.authorization).toBe("[REDACTED]");
    expect(sanitized.phoneNumberSnapshot).toBe("62***890");
    expect(sanitized.messageBody).toBe("[REDACTED]");
    expect(sanitized.payload).toEqual({ sanitized: true, keys: ["token", "invoice"] });
    expect(String(sanitized.syncError).length).toBeLessThanOrEqual(161);
  });
});
