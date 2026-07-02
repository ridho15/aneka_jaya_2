import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TopLoadingBar } from "@/components/ui/TopLoadingBar";
import { shouldStartTopLoadingForFormAction, shouldStartTopLoadingForHref } from "@/lib/navigation/topLoading";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams("")
}));

describe("top loading navigation helpers", () => {
  const current = "https://app.local/dashboard?from=2026-07-01";

  it("starts for internal route or query changes", () => {
    expect(shouldStartTopLoadingForHref("/penjualan", current)).toBe(true);
    expect(shouldStartTopLoadingForHref("/dashboard?from=2026-07-02", current)).toBe(true);
    expect(shouldStartTopLoadingForFormAction("", current)).toBe(true);
  });

  it("ignores external, hash-only, and same-url links", () => {
    expect(shouldStartTopLoadingForHref("https://example.com/dashboard", current)).toBe(false);
    expect(shouldStartTopLoadingForHref("#filters", current)).toBe(false);
    expect(shouldStartTopLoadingForHref("/dashboard?from=2026-07-01#filters", current)).toBe(false);
    expect(shouldStartTopLoadingForHref("mailto:test@example.com", current)).toBe(false);
  });
});

describe("TopLoadingBar", () => {
  it("renders the global route progress indicator shell", () => {
    const html = renderToStaticMarkup(<TopLoadingBar />);

    expect(html).toContain('data-testid="top-loading-bar"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("top-loading-bar");
  });
});
