# Audit Kontrak ERP Pengeluaran AJ

Tanggal audit: 2026-07-01

Sumber kontrak: OpenAPI live `https://ankjy.playgo.id/integrations/openapi.yaml` dan source integrasi SLM.

## Temuan Utama

- Belum ditemukan endpoint resmi cash/bank expense umum yang setara langsung dengan adapter `POST /sales`.
- Endpoint finance/payment resmi yang tersedia berfokus pada `/purchase-payments`, `/sales-payments`, ringkasan `/payments`, `/receivables`, dan `/payables`.
- Endpoint tersebut membutuhkan konteks invoice/customer/supplier dan belum mewakili input pengeluaran operasional bebas dari SLM.
- Flow pengeluaran AJ di SLM saat ini memakai `/neo/commands` dengan intent operasional “Transaksi Kas & Bank”.
- `ExpenseRecord` tetap menjadi source of truth lokal agar pengeluaran tidak hilang saat ERP gagal.

## Keputusan Implementasi Aman

- Pengeluaran tipe `AJ` tetap disimpan dulu sebagai `ExpenseRecord`.
- Jika ERP/Neo command berhasil, status menjadi `erpSyncStatus="synced"`.
- Jika ERP/Neo command gagal, status menjadi `erpSyncStatus="failed"` dan tampil di `/erp-sync` untuk retry.
- Tipe non-AJ tetap lokal dengan `erpSyncStatus="not_required"`.
- Adapter finance terstruktur baru hanya dibuat setelah OpenAPI live menyediakan endpoint cash/bank expense resmi dan payload wajibnya jelas.

## Live QA

- Marker: `QA SLM EXPENSE DELETE 1782852519265`.
- Tipe: `AJ`.
- Rekening: `Kas AJ`.
- Nominal: `Rp 1.000`.
- Hasil SLM: detail pengeluaran `E-1782852551133-174197be` berstatus `erpSyncStatus="synced"`.
- Hasil ERP Sync: marker QA tidak muncul di daftar pending/failed pengeluaran.
- Catatan: Neo tidak mengembalikan `erpReference` untuk transaksi QA ini, sehingga detail menampilkan referensi ERP `—`.

## Catatan UI

- Form pengeluaran harus menjelaskan bahwa tipe AJ memakai command Kas & Bank.
- Status `synced` tidak boleh diberikan hanya karena data tersimpan lokal.
- Error ERP tetap ditampilkan ringkas dan aman, tanpa token, payload penuh, atau response mentah.
