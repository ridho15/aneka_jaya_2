import { describe, expect, it, vi } from "vitest";
import { loadPrintPreviewText, printPreviewEndpoint, printPreviewPath } from "@/lib/print/preview";

describe("print preview UI helpers", () => {
  it("builds print API and page URLs", () => {
    expect(printPreviewEndpoint("sales", "S-1")).toBe("/api/print/sales/S-1");
    expect(printPreviewEndpoint("tempo", "TMP 1")).toBe("/api/print/tempo/TMP%201");
    expect(printPreviewPath("sales", "S-1")).toBe("/print/sales/S-1");
    expect(printPreviewPath("tempo", "TMP 1", true)).toBe("/print/tempo/TMP%201?auto=1");
  });

  it("loads text from the expected endpoint", async () => {
    const fetcher = vi.fn(async () => new Response("NOTA\nTOTAL", { status: 200 }));

    await expect(loadPrintPreviewText("sales", "S-1", fetcher as unknown as typeof fetch)).resolves.toBe("NOTA\nTOTAL");
    expect(fetcher).toHaveBeenCalledWith("/api/print/sales/S-1", { cache: "no-store" });
  });

  it("fails clearly when the preview endpoint is forbidden or missing", async () => {
    const fetcher = vi.fn(async () => new Response("Tidak punya akses.", { status: 403 }));

    await expect(loadPrintPreviewText("tempo", "TMP-404", fetcher as unknown as typeof fetch)).rejects.toThrow("Tidak punya akses.");
  });
});
