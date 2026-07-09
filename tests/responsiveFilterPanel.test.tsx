import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Input } from "@/components/ui/Input";
import { ResponsiveFilterPanel } from "@/components/ui/ResponsiveFilterPanel";

describe("ResponsiveFilterPanel", () => {
  it("renders mobile trigger, desktop form, active chips, and reset link", () => {
    const html = renderToStaticMarkup(
      <ResponsiveFilterPanel
        title="Filter penjualan"
        resetHref="/penjualan"
        activeFilters={["Tipe: SLM", "Pembayaran: Cash"]}
        formClassName="grid gap-3 md:grid-cols-4"
        actionsClassName="md:col-span-4"
      >
        <label>Keyword<Input name="keyword" defaultValue="Ridho" /></label>
      </ResponsiveFilterPanel>
    );

    expect(html).toContain("Filter penjualan");
    expect(html).toContain("2 aktif");
    expect(html).toContain("Tipe: SLM");
    expect(html).toContain("Pembayaran: Cash");
    expect(html).toContain('href="/penjualan"');
    expect(html).toContain("md:hidden");
    expect(html).toContain("hidden p-5 md:block");
    expect(html).toContain("md:col-span-4");
  });
});
