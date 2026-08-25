import { describe, expect, it } from "vitest";
import { splitPrintPreviewPages } from "@/lib/print/preview";

describe("Continuous Form Print Preview", () => {
  it("splits multi-page continuous dot matrix text by form-feed character", () => {
    const rawDotMatrix = "HEADER 1\nITEM 1\n\x0CHEADER 2\nITEM 2\n";
    const pages = splitPrintPreviewPages(rawDotMatrix);

    expect(pages).toHaveLength(2);
    expect(pages[0]).toBe("HEADER 1\nITEM 1\n");
    expect(pages[1]).toBe("HEADER 2\nITEM 2\n");
  });

  it("handles single page continuous dot matrix text without empty sheets", () => {
    const singlePage = "HEADER 1\nTOTAL: 1000\n\x0C";
    const pages = splitPrintPreviewPages(singlePage);

    expect(pages).toHaveLength(1);
    expect(pages[0]).toBe("HEADER 1\nTOTAL: 1000\n");
  });
});
