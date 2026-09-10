import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  role: "OWNER" as string,
  metricsSummary: {
    total: { count: 28, amount: 166_529_000 },
    overdue: { count: 6, amount: 59_692_000, percentage: 35.8 },
    comingSoonH3: {
      count: 8,
      amount: 35_779_000,
      percentage: 21.5,
      fromDate: "2026-09-10",
      toDate: "2026-09-13"
    },
    beyondH3: {
      count: 14,
      amount: 71_058_000,
      percentage: 42.7,
      fromDate: "2026-09-14"
    }
  },
  listTempoReceivablesPage: vi.fn().mockResolvedValue({
    data: [],
    meta: { page: 1, pageSize: 10, total: 28, totalPages: 3 }
  }),
  listTempoTipeOptions: vi.fn().mockResolvedValue(["SLM", "MJ"]),
  getTempoMetricsSummary: vi.fn(),
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

vi.mock("@/lib/tempo/store", () => ({
  listTempoReceivablesPage: mocks.listTempoReceivablesPage,
  listTempoTipeOptions: mocks.listTempoTipeOptions,
  getTempoMetricsSummary: mocks.getTempoMetricsSummary
}));

vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>
}));

describe("TempoPage KPI summary widgets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = "OWNER";
    mocks.getTempoMetricsSummary.mockResolvedValue(mocks.metricsSummary);
  });

  it("renders all 4 KPI summary cards with correct amounts, counts, and percentages", async () => {
    const TempoPage = (await import("@/app/tempo/page")).default;
    const pageElement = await TempoPage({});
    const html = renderToStaticMarkup(pageElement);

    // 1. Total Tempo Aktif
    expect(html).toContain("Total Tempo Aktif");
    expect(html).toContain("28 Nota");
    expect(html).toContain("166.529.000");

    // 2. Lewat Jatuh Tempo (Overdue)
    expect(html).toContain("Lewat Jatuh Tempo");
    expect(html).toContain("6 Nota");
    expect(html).toContain("35.8%");
    expect(html).toContain("59.692.000");

    // 3. Jatuh Tempo Segera (H-3)
    expect(html).toContain("Jatuh Tempo Segera (H-3)");
    expect(html).toContain("8 Nota");
    expect(html).toContain("21.5%");
    expect(html).toContain("35.779.000");

    // 4. Jatuh Tempo Aman (> H-3)
    expect(html).toContain("Jatuh Tempo Aman (&gt; H-3)");
    expect(html).toContain("14 Nota");
    expect(html).toContain("42.7%");
    expect(html).toContain("71.058.000");
  });

  it("contains clickable filter links for all 4 KPI cards", async () => {
    const TempoPage = (await import("@/app/tempo/page")).default;
    const pageElement = await TempoPage({});
    const html = renderToStaticMarkup(pageElement);

    // Check filter link URLs
    expect(html).toContain('href="/tempo"');
    expect(html).toContain('href="/tempo?status=overdue"');
    expect(html).toContain('href="/tempo?dueFrom=2026-09-10&amp;dueTo=2026-09-13"');
    expect(html).toContain('href="/tempo?dueFrom=2026-09-14"');
  });

  it("applies active indicator when a specific filter is selected in searchParams", async () => {
    const TempoPage = (await import("@/app/tempo/page")).default;
    const pageElement = await TempoPage({
      searchParams: Promise.resolve({ status: "overdue" })
    });
    const html = renderToStaticMarkup(pageElement);

    // Overdue card should have active ring
    expect(html).toContain("ring-2 ring-rose-600");
  });
});
