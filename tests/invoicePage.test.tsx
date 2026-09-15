import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SalesInvoicePage from "@/app/penjualan/[id]/invoice/page";
import ExpenseInvoicePage from "@/app/pengeluaran/[id]/invoice/page";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  getCurrentUser: vi.fn(),
  getCurrentRole: vi.fn(),
  getSalesRecordForUser: vi.fn(),
  getExpenseRecord: vi.fn(),
  listAllRekeningAccounts: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getCurrentRole: mocks.getCurrentRole,
}));

vi.mock("@/lib/sales/access", () => ({
  getSalesRecordForUser: mocks.getSalesRecordForUser,
}));

vi.mock("@/lib/expenses/store", () => ({
  getExpenseRecord: mocks.getExpenseRecord,
}));

vi.mock("@/lib/business/masterData", () => ({
  listAllRekeningAccounts: mocks.listAllRekeningAccounts,
}));

describe("SalesInvoicePage (Server Component)", () => {
  it("renders invoice for authenticated user with penjualan.create permission", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "u-1",
      name: "Admin User",
      role: "ADMIN",
    });

    mocks.getSalesRecordForUser.mockResolvedValue({
      id: "sale-456",
      saleDate: "2026-09-15",
      transactionNumber: "0926-1071",
      customerName: "Wiwi",
      customerLocation:
        "Makassar, Kompleks Anggrek Blok AM6 No 20, Telp: 081341943600",
      notes: "Catatan pengiriman",
      shippingMethod: "di Tempat",
      paymentMethod: "TF",
      rekeningId: "rek-maybank",
      rekeningNameSnapshot: "Maybank Tsani",
      total: 163000,
      items: [
        {
          productRef: "AJKP48-12",
          quantity: 1,
          unitPrice: 163000,
          discount: 0,
          unitSnapshot: "Pack",
        },
      ],
    });

    mocks.listAllRekeningAccounts.mockResolvedValue([
      {
        id: "rek-maybank",
        bank: "Maybank",
        accountNumber: "8167960828",
        name: "Tsani Salim",
      },
    ]);

    const element = await SalesInvoicePage({
      params: Promise.resolve({ id: "sale-456" }),
      searchParams: Promise.resolve({ created: "1" }),
    });

    const html = renderToStaticMarkup(element);

    expect(html).toContain("INV-0926-1071");
    expect(html).toContain("Wiwi");
    expect(html).toContain("Makassar");
    expect(html).toContain("081341943600");
    expect(html).toContain("AJKP48-12");
    expect(html).toContain("Pack");
    expect(html).toContain("Rp163.000.00");
    expect(html).toContain("GRAND TOTAL");
    expect(html).toContain("Rp163.000");
    expect(html).toContain("Maybank • 8167960828");
    expect(html).toContain("a.n. Tsani Salim");
    expect(html).toContain("Transaksi penjualan berhasil disimpan!");
  });

  it("redirects unauthorized roles without permission to root", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "u-viewer",
      name: "Viewer",
      role: "VIEWER",
    });

    await expect(
      SalesInvoicePage({
        params: Promise.resolve({ id: "sale-456" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("throws notFound if sale record is missing", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "u-1",
      name: "Admin User",
      role: "ADMIN",
    });
    mocks.getSalesRecordForUser.mockResolvedValue(null);

    await expect(
      SalesInvoicePage({
        params: Promise.resolve({ id: "non-existent" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("ExpenseInvoicePage (Server Component)", () => {
  it("renders expense voucher for authenticated user with pengeluaran.view permission", async () => {
    mocks.getCurrentRole.mockResolvedValue("FINANCE");

    mocks.getExpenseRecord.mockResolvedValue({
      id: "EXP-2026-001",
      expenseDate: "2026-09-15",
      vendorName: "UD Bintang Makmur",
      category: "Bahan Packing",
      description: "Plastik Bubble Wrap 5 Roll",
      amount: 250000,
      paymentMethod: "Cash",
      rekeningNameSnapshot: "Kas Toko",
      coaNameSnapshot: "Kas Kecil",
      notes: "Pembelian langsung",
    });

    const element = await ExpenseInvoicePage({
      params: Promise.resolve({ id: "EXP-2026-001" }),
      searchParams: Promise.resolve({ created: "1" }),
    });

    const html = renderToStaticMarkup(element);

    expect(html).toContain("EXP-2026-001");
    expect(html).toContain("BUKTI PENGELUARAN");
    expect(html).toContain("UD Bintang Makmur");
    expect(html).toContain("Plastik Bubble Wrap 5 Roll");
    expect(html).toContain("Rp250.000");
    expect(html).toContain("Kas Toko");
    expect(html).toContain("Transaksi pengeluaran berhasil disimpan!");
  });

  it("redirects unauthorized roles without permission to root", async () => {
    mocks.getCurrentRole.mockResolvedValue("VIEWER");

    await expect(
      ExpenseInvoicePage({
        params: Promise.resolve({ id: "EXP-2026-001" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/");
  });
});
