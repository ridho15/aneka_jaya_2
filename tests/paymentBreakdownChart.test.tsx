import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentBreakdownChart } from "@/components/dashboard/PaymentBreakdownChart";

describe("PaymentBreakdownChart", () => {
  it("renders cash and TF bank/rekening rows with dashboard money", () => {
    const html = renderToStaticMarkup(<PaymentBreakdownChart data={{
      total: 13_508_000,
      cash: { label: "Cash", value: 100_000, percentage: 0.740301302931595, rekeningId: "cash", paymentMethod: "Cash" },
      transfers: [
        { label: "BCA Operasional - BCA", value: 13_408_000, percentage: 99.2596986970684, rekeningId: "bca", paymentMethod: "TF" }
      ]
    }} filters={{ from: "2026-07-01", to: "2026-07-31" }} />);

    expect(html).toContain("PEMBAYARAN");
    expect(html).toContain("Cash &amp; transfer");
    expect(html).toContain("Cash");
    expect(html).toContain("TF: BCA Operasional - BCA");
    expect(html).toContain("Rp 13.408 jt");
    expect(html).toContain("href=\"/penjualan?from=2026-07-01&amp;to=2026-07-31&amp;paymentMethod=TF&amp;approvalStatus=approved&amp;rekening=bca\"");
  });
});
