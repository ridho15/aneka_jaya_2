import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Sale } from "@/lib/types/sales";

vi.mock("@/components/transactions/TransactionCancelButton", () => ({
  TransactionCancelButton: ({ triggerLabel }: { triggerLabel?: string }) => <button>{triggerLabel || "Cancel"}</button>
}));

const { SalesHistoryList, SalesItemsDetail, nextExpandedSaleId, salesItemSubtotal } = await import("@/components/transactions/SalesHistoryList");

const sale: Sale = {
  id: "sale-1",
  saleDate: "2026-07-21",
  customerName: "Toko Contoh",
  paymentMethod: "Cash",
  total: 195_000,
  items: [
    { productRef: "ERP-001", quantity: 2, unitPrice: 50_000, discount: 5_000, unitSnapshot: "PCS" },
    { productRef: "MAN-001", productInputMode: "manual", manualProduct: { sku: "MAN-001", name: "Produk Manual" }, quantity: 1, unitPrice: 100_000 }
  ]
};

describe("SalesHistoryList", () => {
  it("renders collapsed expand controls for desktop and mobile", () => {
    const html = renderToStaticMarkup(<SalesHistoryList sales={[sale]} canManage={false} canViewTransactionNumber />);

    expect(html.match(/Lihat item \(2\)/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Lihat item transaksi Toko Contoh"');
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(html).not.toContain("ERP-001");
  });

  it("uses accordion toggle semantics", () => {
    expect(nextExpandedSaleId(null, "sale-1")).toBe("sale-1");
    expect(nextExpandedSaleId("sale-1", "sale-1")).toBeNull();
    expect(nextExpandedSaleId("sale-1", "sale-2")).toBe("sale-2");
  });

  it("calculates item subtotal after nominal discount", () => {
    expect(salesItemSubtotal(sale.items[0])).toBe(95_000);
    expect(salesItemSubtotal(sale.items[1])).toBe(100_000);
  });

  it("renders ERP and manual product labels with quantities and totals", () => {
    const html = renderToStaticMarkup(<SalesItemsDetail sale={sale} />);

    expect(html).toContain("ERP-001");
    expect(html).toContain("Produk Manual");
    expect(html).toContain("SKU: MAN-001");
    expect(html).toContain("2 PCS");
    expect(html).toContain("95.000");
  });

  it("uses the correct desktop empty-state colspan", () => {
    const ownerHtml = renderToStaticMarkup(<SalesHistoryList sales={[]} canManage={false} canViewTransactionNumber />);
    const otherHtml = renderToStaticMarkup(<SalesHistoryList sales={[]} canManage={false} canViewTransactionNumber={false} />);

    expect(ownerHtml).toContain('colSpan="11"');
    expect(otherHtml).toContain('colSpan="10"');
  });

  it("renders direct Detail, Cetak, Edit, and Batal buttons without Lainnya dropdown menu", () => {
    const html = renderToStaticMarkup(<SalesHistoryList sales={[sale]} canManage={true} canViewTransactionNumber />);
    expect(html).toContain("Detail");
    expect(html).toContain("Cetak");
    expect(html).toContain("Edit");
    expect(html).toContain("Batal");
    expect(html).not.toContain("LX-310");
    expect(html).not.toContain("Lainnya");
    expect(html).not.toContain("Preview Cetak");
  });
});
