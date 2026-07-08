import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RekeningManager } from "@/components/settings/RekeningManager";
import { TipeManager } from "@/components/settings/TipeManager";
import type { BookkeepingType, RekeningAccount } from "@/lib/business/masterData";

const types: BookkeepingType[] = [
  { id: "W", code: "W", name: "Walk In", isActive: true, sortOrder: 1 },
  { id: "SLM", code: "SLM", name: "SLM", isActive: true, sortOrder: 2 }
];

const rekenings: RekeningAccount[] = [
  { id: "cash-w", bank: "Cash", name: "Kas Walk In", accountNumber: "-", isCash: true, tipeIds: ["W"] },
  { id: "dummy-bca-w", bank: "BCA", name: "BCA Operasional", accountNumber: "123456", tipeIds: ["W", "SLM"] }
];

describe("settings managers responsive markup", () => {
  it("keeps rekening details and actions available in the rendered markup", () => {
    const html = renderToStaticMarkup(<RekeningManager types={types} rekenings={rekenings} />);

    expect(html).toContain("Daftar Rekening");
    expect(html).toContain("Kas Walk In");
    expect(html).toContain("BCA Operasional");
    expect(html).toContain("123456");
    expect(html).toContain("Edit");
    expect(html).toContain("Nonaktifkan");
    expect(html).toContain("md:hidden");
    expect(html).toContain("overflow-x-auto");
  });

  it("keeps tipe details and actions available in the rendered markup", () => {
    const html = renderToStaticMarkup(<TipeManager types={types} rekenings={rekenings} />);

    expect(html).toContain("Daftar Tipe Pembukuan");
    expect(html).toContain("Walk In");
    expect(html).toContain("SLM");
    expect(html).toContain("BCA Operasional");
    expect(html).toContain("Nonaktifkan");
    expect(html).toContain("md:hidden");
    expect(html).toContain("overflow-x-auto");
  });
});
