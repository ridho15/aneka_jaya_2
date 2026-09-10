import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  role: "OWNER" as string,
  getFinancialAiForecast: vi.fn().mockResolvedValue({
    generatedAt: new Date().toISOString(),
    model: "gemini-2.5-flash",
    currency: "IDR",
    baseMetrics: { currentCashBalance: 25_000_000 },
    projections: { runwayDays: 30, healthStatus: "HEALTHY" },
    criticalAlerts: [],
    dailyTimeline: [],
    priorityCollections: [],
    executiveSummary: {
      headline: "Arus kas sehat.",
      weeklyActionPriorities: []
    }
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  })
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentRole: vi.fn(async () => mocks.role)
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

vi.mock("@/lib/ai/financialAiService", () => ({
  getFinancialAiForecast: mocks.getFinancialAiForecast
}));

vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>
}));

vi.mock("@/components/finance/AiFinancialForecastView", () => ({
  AiFinancialForecastView: () => <div data-testid="ai-finance-view">AI Finance View Content</div>
}));

import AiFinancialForecastPage from "@/app/reports/ai-finance/page.tsx";

describe("AiFinancialForecastPage Access Control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = "OWNER";
  });

  it("redirects non-OWNER role to /dashboard", async () => {
    mocks.role = "SUPERVISOR";
    await expect(AiFinancialForecastPage()).rejects.toThrow("redirect:/dashboard");
    expect(mocks.getFinancialAiForecast).not.toHaveBeenCalled();
  });

  it("renders page content for OWNER role", async () => {
    mocks.role = "OWNER";
    const element = await AiFinancialForecastPage();
    expect(element).toBeDefined();
    expect(mocks.getFinancialAiForecast).toHaveBeenCalled();
  });
});
