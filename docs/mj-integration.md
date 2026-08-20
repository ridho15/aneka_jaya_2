# Integrasi MJ → SLM

Semua create invoice wajib mengirim `processing_mode`. Token Bearer hanya dipakai server-to-server dan dipisahkan antara sandbox dan production.

## Mode pemrosesan

| Mode | Perilaku SLM | Identifier item | Payment Tempo lanjutan | Cancel |
|---|---|---|---|---|
| `slm_process_aj` | Customer → invoice → release stok → payment AJ | Produk dan gudang AJ wajib | Diteruskan ke AJ | Reversal otomatis ke AJ & pembukuan SLM |
| `aj_already_processed` | Hanya menyimpan snapshot; tidak memanggil AJ | Produk dan gudang AJ wajib | Lokal SLM saja | Cancel lokal SLM |
| `record_only` | Hanya menyimpan snapshot non-AJ | `product_reference` dan `product_name` wajib; seluruh ID AJ opsional | Lokal SLM saja | Cancel lokal SLM |

Untuk `aj_already_processed`, `external_reference`, `invoice_reference`, dan `aj_invoice_number` wajib sama. `aj_customer_id` wajib dan `aj_invoice_id` opsional. Rekening manual `record_only` memakai `account_reference` dan `name`; COA AJ tidak diperlukan.

## Idempotency dan status

`source=MJ` dan `external_reference` membentuk unique key. Hash immutable mencakup mode, identitas AJ, customer, payment, item, dan nominal. Duplicate identik mengembalikan `200 already_processed`; perubahan payload atau mode menghasilkan `409 REFERENCE_CONFLICT`.

Lookup mengembalikan `processing_mode`, identitas AJ, `status.customer`, `status.invoice`, `status.stock_release`, `status.aj_payment`, `receivable_status`, remaining amount, error terakhir, serta URL print. Status `externally_processed` berarti tahap dilakukan di luar SLM; `not_required` berarti tahap AJ tidak berlaku.

Kegagalan AJ hanya mungkin pada `slm_process_aj` dan menghasilkan `502 AJ_UPSTREAM_ERROR` atau `504 AJ_TIMEOUT` dengan `retryable=true`. Request jaringan AJ memiliki timeout 12 detik dan tidak dijalankan di dalam transaksi database.

## Payment, cancel, dan sinkronisasi cetak (Print Events)

`POST /api/integrations/mj/invoices/{external_reference}/payments` selalu idempotent berdasarkan `payment_reference`. Overpayment ditolak. Hanya invoice `slm_process_aj` yang meneruskan payment ke AJ.

`POST /api/integrations/mj/invoices/{external_reference}/cancel` menerima `{ "reason": "..." }`. Untuk `slm_process_aj`, SLM meneruskan reversal faktur, stok, dan pembayaran ke AJ ERP. Pada pembukuan SLM, invoice dan Tempo diubah menjadi `cancelled`, dan pembayaran Tempo dibalikkan (`TempoPaymentReversal`). Attempt audit menyimpan client integrasi dan alasan. Invoice MJ tetap tidak dapat diedit atau dibatalkan melalui UI penjualan umum.

`POST /api/integrations/mj/invoices/{external_reference}/print-events` menerima payload event pencetakan dari MJ (misal: `{ "printed_at": "...", "printed_by": "Kasir MJ", "printer_name": "...", "format": "dot_matrix" }`). SLM mencatat status cetak (`is_printed`, `printed_at`, `printed_by`, `print_count`) ke dalam metadata transaksi dan membuat log audit. Riwayat transaksi dan detail penjualan di SLM menampilkan indikator bahwa invoice telah dicetak.

Untuk transaksi koreksi baru, sistem pengirim (MJ) wajib menggunakan `external_reference` baru (unik) agar tidak terjadi konflik referensi dengan transaksi lama yang telah dibatalkan.

## Deployment

1. Jalankan `npm run db:migrate:deploy` dan `npm run prisma:generate`.
2. Atur `MJ_INTEGRATION_ENVIRONMENT=sandbox` atau `production`.
3. Rate limit default: 60 mutation/menit dan 300 read/menit per client.
4. Provision token sandbox dengan `npm run integration:token:provision -- --client=mj --environment=sandbox`.
5. Tetapkan Base URL sandbox dari deployment, lalu berikan Base URL, token, dan `/api/docs/openapi.json` kepada MJ.
6. UAT ketiga mode sebelum migration dan token production diterbitkan.

Smoke test sandbox: create → lookup → duplicate → payment Tempo → cancel sesuai mode → print text/PRN/browser. Untuk `slm_process_aj`, tambahkan simulasi timeout AJ dan retry.
