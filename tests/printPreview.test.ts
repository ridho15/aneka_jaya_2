import { describe, expect, it, vi } from "vitest";
import { loadPrintPreviewText, printPreviewEndpoint, printPreviewListPath, printPreviewPath, splitPrintPreviewPages } from "@/lib/print/preview";

describe("print preview UI helpers", () => {
  it("builds print API and page URLs", () => {
    expect(printPreviewEndpoint("sales", "S-1")).toBe("/api/print/sales/S-1");
    expect(printPreviewEndpoint("sales", "S-1", "prn")).toBe("/api/print/sales/S-1?format=prn");
    expect(printPreviewEndpoint("expenses", "EXP-1")).toBe("/api/print/expenses/EXP-1");
    expect(printPreviewEndpoint("tempo", "TMP 1")).toBe("/api/print/tempo/TMP%201");
    expect(printPreviewPath("sales", "S-1")).toBe("/print/sales/S-1");
    expect(printPreviewPath("expenses", "EXP-1", true)).toBe("/print/expenses/EXP-1?auto=1");
    expect(printPreviewPath("tempo", "TMP 1", true)).toBe("/print/tempo/TMP%201?auto=1");
    expect(printPreviewListPath("sales")).toBe("/penjualan");
    expect(printPreviewListPath("expenses")).toBe("/pengeluaran");
    expect(printPreviewListPath("tempo")).toBe("/tempo");
  });

  it("loads text from the expected endpoint", async () => {
    const fetcher = vi.fn(async () => new Response("NOTA\nTOTAL", { status: 200 }));

    await expect(loadPrintPreviewText("sales", "S-1", fetcher as unknown as typeof fetch)).resolves.toBe("NOTA\nTOTAL");
    expect(fetcher).toHaveBeenCalledWith("/api/print/sales/S-1", { cache: "no-store" });
  });

  it("splits form-feed content into browser print sheets without a trailing blank sheet", () => {
    expect(splitPrintPreviewPages("PAGE 1\n\x0CPAGE 2\n")).toEqual(["PAGE 1\n", "PAGE 2\n"]);
    expect(splitPrintPreviewPages("PAGE 1\n\x0C")).toEqual(["PAGE 1\n"]);
    expect(splitPrintPreviewPages("PAGE 1\n")).toEqual(["PAGE 1\n"]);
  });

  it("fails clearly when the preview endpoint is forbidden or missing", async () => {
    const fetcher = vi.fn(async () => new Response("Tidak punya akses.", { status: 403 }));

    await expect(loadPrintPreviewText("tempo", "TMP-404", fetcher as unknown as typeof fetch)).rejects.toThrow("Tidak punya akses.");
  });
});
