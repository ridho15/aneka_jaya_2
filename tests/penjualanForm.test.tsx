import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PenjualanForm } from "@/components/forms/PenjualanForm";
import type { BookkeepingType, RekeningAccount } from "@/lib/business/masterData";
import type { Sale } from "@/lib/types/sales";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const tipes: BookkeepingType[] = [
  { id: "W", code: "W", name: "Walk In", isActive: true, sortOrder: 1 }
];

const rekenings: RekeningAccount[] = [
  { id: "cash-w", bank: "Cash", name: "Kas Walk In", accountNumber: "-", isCash: true, tipeIds: ["W"] },
  { id: "dummy-bca-w", bank: "BCA", name: "BCA Operasional", accountNumber: "123", tipeIds: ["W"] }
];

const sale: Sale = {
  id: "S-1",
  saleDate: "2026-07-02",
  tipeId: "W",
  tipeCodeSnapshot: "W",
  tipeNameSnapshot: "Walk In",
  customerName: "Walk In",
  customerLocation: "Toko",
  shippingMethod: "di Tempat",
  paymentMethod: "Cash",
  rekeningId: "legacy-cash",
  rekeningNameSnapshot: "Legacy Cash",
  total: 10000,
  approvalStatus: "approved",
  syncTarget: "local",
  syncStatus: "local",
  createdByUserId: "owner-1",
  createdByNameSnapshot: "Owner",
  createdByRoleSnapshot: "OWNER",
  createdAt: "2026-07-02T00:00:00.000Z",
  items: [{ productRef: "P-1", quantity: 1, unitPrice: 10000, discount: 0 }]
};

describe("PenjualanForm Cash rekening defaults", () => {
  it("renders Kas Walk In as the Cash rekening option for new sales", () => {
    const html = renderToStaticMarkup(<PenjualanForm tipes={tipes} rekenings={rekenings} />);

    expect(html).toContain('<option value="cash-w">Kas Walk In</option>');
    expect(html).not.toContain('<option value="dummy-bca-w">BCA Operasional</option>');
  });

  it("does not force TF sales to Kas Walk In", () => {
    const html = renderToStaticMarkup(<PenjualanForm tipes={tipes} rekenings={rekenings} sale={{ ...sale, paymentMethod: "TF", rekeningId: "dummy-bca-w", rekeningNameSnapshot: "BCA Operasional" }} />);

    expect(html).toContain('<option value="dummy-bca-w">BCA Operasional</option>');
  });

  it("keeps an existing Cash edit rekening visible before the user changes payment method", () => {
    const html = renderToStaticMarkup(<PenjualanForm tipes={tipes} rekenings={rekenings} sale={sale} />);

    expect(html).toContain('<option value="legacy-cash">Legacy Cash</option>');
    expect(html).toContain('<option value="cash-w">Kas Walk In</option>');
  });
});
