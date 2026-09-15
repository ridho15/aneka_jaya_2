import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TransactionInvoiceView } from "@/components/invoice/TransactionInvoiceView";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("TransactionInvoiceView", () => {
  it("renders sales invoice matching the reference design layout", () => {
    const html = renderToStaticMarkup(
      <TransactionInvoiceView
        kind="sales"
        id="sale-123"
        transactionNumber="INV-0926-1071"
        date="15/09/2026"
        customer={{
          name: "Wiwi",
          city: "Makassar",
          phone: "081341943600",
          address:
            "Kompleks Anggrek Blok AM6 No 20, Minasaupa, Makassar, Kec. Rappocini",
          shippingMethod: "di Tempat",
        }}
        items={[
          {
            index: 1,
            name: "AJKP48-12",
            code: "AJKP48-12",
            quantity: 1,
            unit: "Pack",
            unitPrice: 163000,
            total: 163000,
          },
        ]}
        totalAmount={163000}
        payment={{
          method: "Transfer",
          bankName: "Maybank",
          accountNumber: "8167960828",
          accountHolder: "Tsani Salim",
        }}
        isNewlyCreated={true}
      />,
    );

    // Header checks
    expect(html).toContain("INV-0926-1071");
    expect(html).toContain("INVOICE");
    expect(html).toContain("15/09/2026");

    // Customer section checks
    expect(html).toContain("CUSTOMER");
    expect(html).toContain("Wiwi");
    expect(html).toContain("Makassar •");
    expect(html).toContain("Telp: 081341943600");
    expect(html).toContain(
      "Kompleks Anggrek Blok AM6 No 20, Minasaupa, Makassar, Kec. Rappocini",
    );

    // Stat KPI checks
    expect(html).toContain("ITEM");
    expect(html).toContain("TOTAL QTY");

    // Table checks
    expect(html).toContain("Nama Barang");
    expect(html).toContain("Qty");
    expect(html).toContain("Satuan");
    expect(html).toContain("Harga");
    expect(html).toContain("Total");
    expect(html).toContain("AJKP48-12");
    expect(html).toContain("Pack");
    expect(html).toContain("Rp163.000.00");
    expect(html).toContain("Subtotal 1 item");

    // Grand total banner
    expect(html).toContain("GRAND TOTAL");
    expect(html).toContain("Rp163.000");

    // Payment info
    expect(html).toContain("PEMBAYARAN");
    expect(html).toContain("Maybank • 8167960828");
    expect(html).toContain("a.n. Tsani Salim");

    // Footer
    expect(html).toContain("Terima kasih atas kepercayaan Anda.");

    // Action buttons
    expect(html).toContain("Simpan sebagai Gambar");
    expect(html).toContain("Simpan / Cetak PDF");
    expect(html).toContain("Input Transaksi Baru");
    expect(html).toContain("Kembali ke Riwayat");
    expect(html).toContain("Cetak Struk Dot-Matrix");

    // Newly created alert banner
    expect(html).toContain("Transaksi penjualan berhasil disimpan!");
  });

  it("renders expense voucher cleanly with consistent design", () => {
    const html = renderToStaticMarkup(
      <TransactionInvoiceView
        kind="expenses"
        id="exp-999"
        transactionNumber="EXP-0926-001"
        date="15/09/2026"
        vendor={{
          name: "Toko Sinar Terang",
          category: "Operasional Toko",
          description: "Pembelian ATK dan Plastik Packing",
          notes: "Nota terlampir",
        }}
        items={[
          {
            index: 1,
            name: "Pembelian ATK dan Plastik Packing",
            category: "Operasional Toko",
            coa: "Kas Operasional",
            quantity: 1,
            unit: "Transaksi",
            unitPrice: 75000,
            total: 75000,
          },
        ]}
        totalAmount={75000}
        payment={{
          method: "Cash",
          bankName: "Kas Toko",
        }}
        isNewlyCreated={false}
      />,
    );

    // Header
    expect(html).toContain("EXP-0926-001");
    expect(html).toContain("BUKTI PENGELUARAN");
    expect(html).toContain("15/09/2026");

    // Vendor section
    expect(html).toContain("PENERIMA / VENDOR");
    expect(html).toContain("Toko Sinar Terang");
    expect(html).toContain("Kategori: Operasional Toko");
    expect(html).toContain("Pembelian ATK dan Plastik Packing");

    // Table
    expect(html).toContain("Deskripsi Pengeluaran");
    expect(html).toContain("Kas Operasional");
    expect(html).toContain("Subtotal 1 transaksi");

    // Grand total
    expect(html).toContain("GRAND TOTAL");
    expect(html).toContain("Rp75.000");

    // Payment
    expect(html).toContain("PEMBAYARAN");
    expect(html).toContain("Kas Toko");
  });

  it("renders sales Nota Tempo when payment method is Tempo with due date, enter space, and dateTime", () => {
    const html = renderToStaticMarkup(
      <TransactionInvoiceView
        kind="sales"
        id="sale-tempo-001"
        transactionNumber="INV-0926-8888"
        date="16/09/2026"
        dateTime="16/09/2026 14:30"
        dueDate="30/09/2026"
        isTempo={true}
        customer={{
          name: "Pelanggan Grosir Sejahtera",
          city: "Jakarta Barat",
          phone: "081234567890",
          address: "Jalan Peta Selatan No 10",
          shippingMethod: "di Tempat",
        }}
        items={[
          {
            index: 1,
            name: "Barang Grosir A",
            code: "BRG-01",
            quantity: 5,
            unit: "Lsn",
            unitPrice: 200000,
            total: 1000000,
          },
        ]}
        totalAmount={1000000}
        payment={{
          method: "Tempo",
          notes: "Tempo 14 Hari",
        }}
        isNewlyCreated={true}
      />,
    );

    // Header checks: Should be Nota Tempo, NOT INVOICE
    expect(html).toContain("Nota Tempo");
    expect(html).not.toContain(
      '<p class="text-[11px] font-bold uppercase tracking-widest text-slate-400 sm:text-xs">INVOICE</p>',
    );
    expect(html).toContain("Jatuh tempo tanggal 30/09/2026");
    expect(html).toContain("16/09/2026 14:30");

    // Success banner for tempo
    expect(html).toContain("Transaksi penjualan tempo berhasil disimpan!");
    expect(html).toContain("Nota tempo telah diterbitkan.");

    // Customer & payment info
    expect(html).toContain("Pelanggan Grosir Sejahtera");
    expect(html).toContain("Tempo • Tempo 14 Hari");
  });
});

