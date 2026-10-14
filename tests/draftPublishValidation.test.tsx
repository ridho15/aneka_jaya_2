import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PenjualanForm } from "@/components/forms/PenjualanForm";
import type { Sale } from "@/lib/types/sales";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("PenjualanForm Draft Publish Diagnostic & Validation", () => {
  const mockTipes = [
    { id: "AJ", code: "AJ", name: "Aneka Jaya", isActive: true, sortOrder: 1 },
    { id: "W", code: "W", name: "Walk In", isActive: true, sortOrder: 2 },
  ];

  const mockRekenings = [
    {
      id: "rek-1",
      bank: "BCA",
      name: "BCA AJ",
      accountNumber: "1234567890",
      isActive: true,
      tipeIds: ["AJ", "W"],
    },
    {
      id: "cash-w",
      bank: "Cash",
      name: "Kas Tunai Walk In",
      accountNumber: "-",
      isActive: true,
      tipeIds: ["AJ", "W"],
    },
  ];

  it("renders draft publish blocking warning when warehouse is missing on ERP item", () => {
    const draftSale: Sale = {
      id: "draft-test-1",
      saleDate: "2026-09-15",
      transactionAt: "2026-09-15T10:00",
      customerName: "Toko Abadi",
      customerLocation: "Makassar",
      approvalStatus: "draft",
      tipeId: "AJ",
      tipeCodeSnapshot: "AJ",
      paymentMethod: "Cash",
      total: 150000,
      items: [
        {
          productRef: "BRG-001",
          productId: "prod-1",
          quantity: 2,
          unitPrice: 75000,
          discount: 0,
          // warehouseId is missing!
        },
      ],
    };

    const html = renderToStaticMarkup(
      <PenjualanForm
        sale={draftSale}
        tipes={mockTipes}
        rekenings={mockRekenings}
        erpTypeCodes={["AJ"]}
      />,
    );

    // Verify blocking reason is rendered
    expect(html).toContain("Penyebab Draft Belum Dapat Dipublish");
    expect(html).toContain("Lokasi gudang belum dipilih untuk potong stok fisik");
    expect(html).toContain("Finalkan &amp; Simpan Penjualan");
    expect(html).toContain("Perbarui Draft");
  });

  it("renders draft publish blocking warning when payment is TF without rekening", () => {
    const draftSale: Sale = {
      id: "draft-test-2",
      saleDate: "2026-09-15",
      transactionAt: "2026-09-15T10:00",
      customerName: "Budi Santoso",
      customerLocation: "Makassar",
      approvalStatus: "draft",
      tipeId: "W",
      paymentMethod: "TF",
      rekeningId: "", // missing rekening!
      total: 100000,
      items: [
        {
          productRef: "BRG-002",
          productId: "prod-2",
          warehouseId: "wh-1",
          quantity: 1,
          unitPrice: 100000,
          discount: 0,
        },
      ],
    };

    const html = renderToStaticMarkup(
      <PenjualanForm
        sale={draftSale}
        tipes={mockTipes}
        rekenings={mockRekenings}
        erpTypeCodes={["AJ"]}
      />,
    );

    expect(html).toContain("Penyebab Draft Belum Dapat Dipublish");
    expect(html).toContain("Pembayaran Transfer (TF): Rekening bank penerima belum dipilih");
  });

  it("renders draft publish blocking warning when payment is Tempo with customer Walk In and missing dueDate", () => {
    const draftSale: Sale = {
      id: "draft-test-3",
      saleDate: "2026-09-15",
      transactionAt: "2026-09-15T10:00",
      customerName: "Walk In", // invalid for Tempo!
      customerLocation: "Toko",
      approvalStatus: "draft",
      tipeId: "W",
      paymentMethod: "Tempo",
      dueDate: "", // missing dueDate!
      total: 200000,
      items: [
        {
          productRef: "BRG-003",
          productId: "prod-3",
          warehouseId: "wh-1",
          quantity: 2,
          unitPrice: 100000,
          discount: 0,
        },
      ],
    };

    const html = renderToStaticMarkup(
      <PenjualanForm
        sale={draftSale}
        tipes={mockTipes}
        rekenings={mockRekenings}
        erpTypeCodes={["AJ"]}
      />,
    );

    expect(html).toContain("Penyebab Draft Belum Dapat Dipublish");
    expect(html).toContain("Pembayaran Tempo: Tanggal jatuh tempo wajib diisi");
    expect(html).toContain("Pembayaran Tempo: Nama customer wajib diisi");
  });

  it("does not block draft finalization when warehouse is selected and administrative data is complete", () => {
    const completeDraftSale: Sale = {
      id: "draft-test-4",
      saleDate: "2026-09-15",
      transactionAt: "2026-09-15T10:00",
      customerName: "Toko Sinar Jaya",
      customerLocation: "Makassar",
      approvalStatus: "draft",
      tipeId: "AJ",
      tipeCodeSnapshot: "AJ",
      paymentMethod: "Cash",
      rekeningId: "rek-1",
      total: 600000,
      items: [
        {
          productRef: "SKU-SJ-PW-001",
          productId: "prod-pw-1",
          warehouseId: "wh-45",
          quantity: 10,
          unitPrice: 60000,
          discount: 0,
        },
      ],
    };

    const html = renderToStaticMarkup(
      <PenjualanForm
        sale={completeDraftSale}
        tipes={mockTipes}
        rekenings={mockRekenings}
        erpTypeCodes={["AJ"]}
      />,
    );

    // Verify diagnostic blocking banner is NOT rendered because warehouse and administrative data are complete
    expect(html).not.toContain("Penyebab Draft Belum Dapat Dipublish");
    expect(html).not.toContain("Kuantitas diminta");
    expect(html).toContain("Finalkan &amp; Simpan Penjualan");
    expect(html).toContain("Perbarui Draft");
  });
});

