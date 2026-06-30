# Audit Kontrak ERP untuk Stock Adjustment dan Koreksi Transaksi

Tanggal audit: 2026-06-30

## Hasil OpenAPI Live

Source of truth:

- Docs: `https://ankjy.playgo.id/integrations/docs`
- OpenAPI YAML: `https://ankjy.playgo.id/integrations/openapi.yaml`

Endpoint relevan yang terkonfirmasi dari OpenAPI live:

- `POST /stock-adjustments` — membuat stock adjustment resmi ERP.
- `GET /stock-movements` — membaca mutasi stok.
- `GET /stocks` — membaca posisi stok.
- `GET /stocks/readiness` — cek kesiapan stok.
- `GET /invoices` dan `GET /invoices/payment-status` — membaca invoice/status pembayaran.
- `POST /sales` — membuat penjualan.
- `POST /neo/commands` — memproses command Neo.

Kontrak `POST /stock-adjustments`:

- required: `warehouse_id`, `adjustment_type`, `reason`, `items`.
- `adjustment_type`: `increase` atau `decrease`.
- item required: `product_id`, `rak_id`, `difference_qty`.
- `approve_now` tersedia dan default ERP adalah `true`.

Endpoint yang belum terlihat di OpenAPI live:

- cancel/update invoice penjualan yang sudah dibuat;
- koreksi invoice synced;
- cancel/update transaksi Kas & Bank pengeluaran.

## Hasil Sebelumnya dari Repo Lokal

Kontrak ERP yang sudah ditemukan di project:

- `GET /products` untuk membaca master barang dari Aneka Jaya ERP.
- `PUT /products/{product}` untuk update master barang.
- `GET /stocks` untuk membaca stok dari Aneka Jaya ERP.
- `GET /invoices` tersedia sebagai adapter baca lanjutan.
- `POST /neo/commands` dipakai untuk create sales, create barang, dan instruksi Kas & Bank.

Kontrak ERP yang sebelumnya belum ditemukan dari repo lokal:

- cancel invoice/transaksi penjualan yang sudah synced;
- koreksi/update invoice yang sudah dibuat;
- cancel/update transaksi Kas & Bank untuk pengeluaran.

## Keputusan Aman

Stock adjustment sekarang boleh dibuka melalui adapter resmi `POST /stock-adjustments`.

Fitur koreksi/cancel transaksi AJ yang sudah synced tetap diblokir sampai endpoint/command resmi tersedia. Sistem tidak membuat fallback stok lokal dan tidak mengirim command ERP berbasis tebakan.

Endpoint guard internal yang disiapkan:

- `POST /api/stocks/adjust` → proxy server-side ke ERP `POST /stock-adjustments`.
- `POST /api/sales/{id}/erp-correction` → `501 ERP_CONTRACT_PENDING` untuk Super Admin.
- `POST /api/expenses/{id}/erp-correction` → `501 ERP_CONTRACT_PENDING` untuk Super Admin.

Role tanpa permission tetap menerima `403`.

## Kontrak yang Dibutuhkan dari ERP

Sebelum fitur dibuka, ERP perlu menyediakan minimal:

- nama endpoint/command resmi;
- method dan payload;
- field referensi transaksi/stok;
- aturan idempotency/retry;
- bentuk response sukses/gagal;
- aturan audit dan pembatalan untuk transaksi yang sudah posted.
