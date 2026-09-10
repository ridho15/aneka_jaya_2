import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  role: "OWNER" as string,
  getFinancialAiForecast: vi.fn(),
  askFinancialCfo: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentRole: vi.fn(async () => mocks.role)
}));

vi.mock("@/lib/ai/financialAiService", () => ({
  getFinancialAiForecast: mocks.getFinancialAiForecast,
  askFinancialCfo: mocks.askFinancialCfo
}));

import { GET as getFinanceForecast } from "@/app/api/ai/finance-forecast/route";
import { POST as postFinanceAdvisor } from "@/app/api/ai/finance-advisor/route";

describe("Financial AI API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = "OWNER";
    mocks.getFinancialAiForecast.mockResolvedValue({
      currency: "IDR",
      baseMetrics: { currentCashBalance: 50_000_000 }
    });
    mocks.askFinancialCfo.mockResolvedValue({
      answer: "Saldo kas saat ini dalam kondisi sangat aman.",
      keyHighlights: ["Likuiditas tinggi"]
    });
  });

  describe("GET /api/ai/finance-forecast", () => {
    it("denies access with 403 for non-OWNER roles", async () => {
      mocks.role = "ADMIN";
      const req = new Request("http://localhost/api/ai/finance-forecast");
      const res = await getFinanceForecast(req);

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain("Hanya Super Admin");
      expect(mocks.getFinancialAiForecast).not.toHaveBeenCalled();
    });

    it("allows access with 200 for OWNER role", async () => {
      mocks.role = "OWNER";
      const req = new Request("http://localhost/api/ai/finance-forecast?force=true");
      const res = await getFinanceForecast(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.baseMetrics.currentCashBalance).toBe(50_000_000);
      expect(mocks.getFinancialAiForecast).toHaveBeenCalledWith({ forceRefresh: true });
    });
  });

  describe("POST /api/ai/finance-advisor", () => {
    it("denies access with 403 for non-OWNER roles", async () => {
      mocks.role = "DELIVERY_DRIVER";
      const req = new Request("http://localhost/api/ai/finance-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "Apakah kas aman?" })
      });
      const res = await postFinanceAdvisor(req);

      expect(res.status).toBe(403);
      expect(mocks.askFinancialCfo).not.toHaveBeenCalled();
    });

    it("returns 400 when question is empty", async () => {
      mocks.role = "OWNER";
      const req = new Request("http://localhost/api/ai/finance-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "   " })
      });
      const res = await postFinanceAdvisor(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain("Pertanyaan wajib diisi");
      expect(mocks.askFinancialCfo).not.toHaveBeenCalled();
    });

    it("returns 200 with advice for valid question from OWNER", async () => {
      mocks.role = "OWNER";
      const req = new Request("http://localhost/api/ai/finance-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "Apakah saldo kas cukup?" })
      });
      const res = await postFinanceAdvisor(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.answer).toContain("sangat aman");
      expect(mocks.askFinancialCfo).toHaveBeenCalledWith("Apakah saldo kas cukup?");
    });
  });
});
