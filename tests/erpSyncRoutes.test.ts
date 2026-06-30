import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  role: "OWNER",
  retryPendingSalesErpSync: vi.fn(),
  retrySalesErpSync: vi.fn(),
  retryPendingExpenseErpSync: vi.fn(),
  retryExpenseErpSync: vi.fn(),
  getErpSyncPreflight: vi.fn(),
  recordAudit: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentRole: vi.fn(async () => mocks.role) }));
vi.mock("@/lib/erpSync/salesRetry", () => ({
  retryPendingSalesErpSync: mocks.retryPendingSalesErpSync,
  retrySalesErpSync: mocks.retrySalesErpSync
}));
vi.mock("@/lib/erpSync/expenseRetry", () => ({
  retryPendingExpenseErpSync: mocks.retryPendingExpenseErpSync,
  retryExpenseErpSync: mocks.retryExpenseErpSync
}));
vi.mock("@/lib/erpSync/preflight", () => ({ getErpSyncPreflight: mocks.getErpSyncPreflight }));
vi.mock("@/lib/audit/store", () => ({ recordAudit: mocks.recordAudit }));

import { POST as retryCron } from "@/app/api/jobs/retry-erp-sync/route";
import { POST as retryOne } from "@/app/api/erp-sync/sales/[id]/retry/route";
import { POST as retryExpense } from "@/app/api/erp-sync/expenses/[id]/retry/route";
import { GET as preflight } from "@/app/api/erp-sync/preflight/route";

describe("ERP sync retry API routes", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "secret");
    mocks.role = "OWNER";
    mocks.retryPendingSalesErpSync.mockReset();
    mocks.retrySalesErpSync.mockReset();
    mocks.retryPendingExpenseErpSync.mockReset();
    mocks.retryExpenseErpSync.mockReset();
    mocks.getErpSyncPreflight.mockReset();
    mocks.recordAudit.mockReset();
  });

  it("rejects cron retry without CRON_SECRET", async () => {
    const response = await retryCron(new Request("http://local/api/jobs/retry-erp-sync", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(mocks.retryPendingSalesErpSync).not.toHaveBeenCalled();
    expect(mocks.retryPendingExpenseErpSync).not.toHaveBeenCalled();
  });

  it("runs cron retry for sales and expenses with a valid CRON_SECRET", async () => {
    mocks.retryPendingSalesErpSync.mockResolvedValue({ attempted: 2, succeeded: 1, failed: 1, results: [] });
    mocks.retryPendingExpenseErpSync.mockResolvedValue({ attempted: 1, succeeded: 1, failed: 0, results: [] });
    const response = await retryCron(new Request("http://local/api/jobs/retry-erp-sync", { method: "POST", headers: { "x-cron-secret": "secret" } }));

    await expect(response.json()).resolves.toMatchObject({ success: true, data: { attempted: 3, succeeded: 2, failed: 1 } });
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "erp_sync", action: "retry_sync" }));
  });

  it("allows OWNER to retry a single sales sync", async () => {
    mocks.retrySalesErpSync.mockResolvedValue({ success: true, message: "Retry ERP berhasil." });
    const response = await retryOne(new Request("http://local/api/erp-sync/sales/S-1/retry", { method: "POST" }), { params: Promise.resolve({ id: "S-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.retrySalesErpSync).toHaveBeenCalledWith("S-1");
  });

  it("allows OWNER to retry a single expense sync", async () => {
    mocks.retryExpenseErpSync.mockResolvedValue({ success: true, message: "Retry pengeluaran ERP berhasil." });
    const response = await retryExpense(new Request("http://local/api/erp-sync/expenses/E-1/retry", { method: "POST" }), { params: Promise.resolve({ id: "E-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.retryExpenseErpSync).toHaveBeenCalledWith("E-1");
  });

  it("rejects manual retry for non-OWNER roles", async () => {
    mocks.role = "ADMIN";
    const response = await retryOne(new Request("http://local/api/erp-sync/sales/S-1/retry", { method: "POST" }), { params: Promise.resolve({ id: "S-1" }) });

    expect(response.status).toBe(403);
    expect(mocks.retrySalesErpSync).not.toHaveBeenCalled();
  });

  it("allows OWNER to run ERP sync preflight", async () => {
    mocks.getErpSyncPreflight.mockResolvedValue({ autoCreateCustomer: { enabled: true, endpointConfigured: true } });
    const response = await preflight();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, data: { autoCreateCustomer: { enabled: true } } });
  });

  it("rejects preflight for non-OWNER roles", async () => {
    mocks.role = "ADMIN";
    const response = await preflight();

    expect(response.status).toBe(403);
    expect(mocks.getErpSyncPreflight).not.toHaveBeenCalled();
  });
});
