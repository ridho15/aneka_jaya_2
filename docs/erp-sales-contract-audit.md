# Audit Kontrak ERP Sales Aneka Jaya

Tanggal audit: 2026-06-30

Sumber kontrak: `https://ankjy.playgo.id/integrations/openapi.yaml`

## Temuan Utama

- Endpoint resmi untuk membuat penjualan adalah `POST /sales`.
- `CreateSaleRequest` mewajibkan `customer_id` dan `items`.
- `SaleItemRequest` mewajibkan `product_id`, `quantity`, dan `unit_price`.
- Endpoint resmi untuk membuat customer adalah `POST /customers`.
- `CustomerRequest` mewajibkan `code`, `name`, `address`, `telephone`, `phone`, `email`, `perusahaan`, `fax`, `tempo_kredit`, `kredit_limit`, dan `nik_npwp`.
- Payload lama SLM melalui `/neo/commands` memakai `customer_name` dan `product_ref`, sehingga belum cukup aman untuk create sales AJ.

## Keputusan Implementasi

- Transaksi tipe `AJ` dikirim memakai adapter resmi `POST /sales`.
- Customer harus bisa di-resolve ke `customer_id` dari `/customers`.
- Jika customer manual tidak ditemukan dan `ANIKA_ERP_AUTO_CREATE_CUSTOMER=true`, SLM membuat customer ERP baru melalui `POST /customers`.
- Jika auto-create customer gagal/nonaktif, transaksi AJ tidak dikirim ke `/sales`; transaksi tetap `failed/retryable` di ERP Sync.
- Item barang harus memakai ERP `product_id`; bila transaksi lama hanya punya kode barang, sistem resolve ulang dari `/products`.
- Jika customer atau produk tidak ditemukan, transaksi tetap `failed` di ERP Sync dengan pesan operasional aman.
- Produk manual AJ wajib punya harga jual dan harga modal valid sebelum invoice dikirim. Jika harga modal kosong, SLM hanya memakai `ANIKA_ERP_DEFAULT_PRODUCT_COST_PRICE` bila env tersebut bernilai lebih dari 0.
- Jika ERP menolak invoice karena HPP/COA/release barang, transaksi tetap `failed/retryable`; UI tidak boleh menampilkan transaksi tersebut sebagai berhasil dikirim.
- Invoice ERP tidak mengurangi stok. Pengurangan stok hanya boleh dianggap selesai setelah SLM memanggil endpoint release stok dan ERP mengembalikan status release sukses.

## Payload Minimum yang Dipakai SLM

```json
{
  "customer_id": 77,
  "order_date": "2026-06-30",
  "delivery_date": "2026-06-30",
  "shipped_to": "Ridho Manual - Toko",
  "tipe_pengiriman": "Kirim Langsung",
  "tempo_pembayaran": 30,
  "items": [
    {
      "product_id": 88,
      "quantity": 1,
      "unit_price": 10000,
      "discount": 0
    }
  ]
}
```

## Kontrak Release Stok

Sumber informasi: konfirmasi kontrak Aneka Jaya ERP, 2026-07-14.

SLM tetap boleh membuat sales/invoice ke ERP seperti flow saat ini, tetapi stok ERP tidak berkurang hanya karena invoice dibuat. Invoice yang dibuat dari integrasi default-nya belum paid: `invoice.status = sent` dan `payment_status = unpaid`. Setelah invoice berhasil dibuat, SLM harus memanggil:

```http
POST /api/integrations/stock-releases
```

Payload minimum:

```json
{
  "erp_reference": "SLM-INV-20260713-001",
  "source": "SLM",
  "source_type": "invoice",
  "source_number": "INV-SLM-001",
  "release_date": "2026-07-13",
  "warehouse_id": 1,
  "notes": "Release stok dari invoice SLM",
  "items": [
    {
      "product_id": 1,
      "sku": "BRG-001",
      "quantity": 2,
      "warehouse_id": 1,
      "rak_id": 5
    }
  ]
}
```

Aturan kontrak:

- `erp_reference` wajib unik dari SLM dan dipakai sebagai idempotency key release.
- `source_type` bernilai `invoice`, `sales_order`, atau `fulfillment`.
- Produk bisa dikirim memakai `product_id` atau `sku`.
- `warehouse_id` wajib.
- `rak_id` opsional, tetapi bila dikirim harus milik warehouse tersebut.
- Release bersifat all-or-nothing. Jika satu item gagal, seluruh release gagal dan stok tidak berubah.
- Jika `erp_reference` yang sama dikirim ulang dan ERP membalas `already_released`, SLM harus memperlakukannya sebagai aman/idempotent dan tidak mengirim release baru dengan referensi berbeda untuk transaksi yang sama.

Response sukses:

```json
{
  "status": "released",
  "message": "Stok berhasil direlease.",
  "data": {
    "erp_reference": "SLM-INV-20260713-001",
    "release_status": "completed",
    "stock_effect": "decreased",
    "items": [
      {
        "product_id": 1,
        "sku": "BRG-001",
        "warehouse_id": 1,
        "rak_id": 5,
        "quantity_released": 2,
        "stock_before": 10,
        "stock_after": 8,
        "movement_id": 9001,
        "journal_posted": true,
        "journal_entry_ids": [7101, 7102]
      }
    ]
  }
}
```

Efek release sukses:

- Stok ERP langsung berkurang.
- `StockMovement` type `sales` dibuat.
- Jurnal keuangan otomatis dibuat: Debit Barang Terkirim dan Credit Persediaan.
- Response memuat `movement_id`, `journal_posted: true`, dan `journal_entry_ids`.

Duplicate/idempotent response:

```json
{
  "status": "already_released"
}
```

Untuk duplicate `already_released`, ERP tidak mengurangi stok ulang, tidak membuat movement ulang, dan tidak membuat jurnal ulang.

Error code yang harus dipetakan SLM ke pesan operasional:

- `stock_insufficient`
- `warehouse_invalid`
- `rak_invalid`
- `product_invalid`
- `hpp_invalid`
- `coa_invalid`
- `validation_failed`

Endpoint pendukung:

```http
GET /api/integrations/stocks/readiness?product_id=1&warehouse_id=1&rak_id=5&required_quantity=2
GET /api/integrations/stocks?product_id=1&warehouse_id=1&rak_id=5
GET /api/integrations/stock-movements?reference_id=SLM-INV-20260713-001
```

## Kontrak Pembayaran Sales

Invoice dari integrasi sales default-nya belum paid (`payment_status = unpaid`). Jika invoice sudah dibayar di SLM dan harus tercatat lunas di Aneka Jaya ERP, SLM perlu mengirim payment terpisah:

```http
POST /api/integrations/sales-payments
```

Catatan implementasi:

- Flow release stok tidak otomatis melunasi invoice ERP.
- SLM perlu plan terpisah untuk memetakan metode pembayaran SLM (`Cash`, `TF`, `Tempo`, `Other`) ke endpoint payment ERP.
- Sampai endpoint payment diimplementasikan, status invoice ERP dapat synced/released stok tetapi payment ERP tetap unpaid.

## Dampak Implementasi SLM Berikutnya

- `syncStatus: "synced"` saat ini hanya berarti invoice berhasil dibuat di ERP, bukan stok sudah berkurang.
- SLM perlu menambah status terpisah untuk release stok, misalnya `stockReleaseStatus`, `stockReleaseError`, `stockReleasedAt`, dan `stockReleaseReference`.
- Setelah `POST /sales` sukses dan mendapat `erpReference`, SLM perlu memanggil `POST /stock-releases` dengan `erp_reference` unik berbasis transaksi SLM/ERP.
- Riwayat Penjualan dan ERP Sync perlu menampilkan kasus invoice sukses tetapi release stok gagal sebagai status berbeda, bukan disamakan dengan gagal create invoice.
- Retry release stok harus memakai `erp_reference` yang sama supaya aman dari pengurangan stok ganda.
- Browser smoke test perlu memvalidasi stok sebelum transaksi, create invoice, release stok, lalu stok setelah release.
- Jika pembayaran ERP dibutuhkan, SLM perlu status payment ERP terpisah agar tidak mencampur invoice sync, stock release, dan pelunasan invoice.

## Payload Minimum Create Customer

```json
{
  "code": "SLM-RIDHO-MANUAL-ABC1",
  "name": "Ridho Manual",
  "address": "Toko Selatan",
  "telephone": "-",
  "phone": "-",
  "email": "customer+slm-ridho-manual-abc1@slm.localhost.test",
  "perusahaan": "Ridho Manual",
  "fax": "-",
  "tempo_kredit": 0,
  "kredit_limit": 0,
  "nik_npwp": "-",
  "keterangan": "Auto-created from SLM transaction"
}
```

## Catatan Keamanan

- Token, session, payload penuh, dan response mentah ERP tidak ditampilkan di browser.
- `ANIKA_ERP_API_TOKEN` kosong bukan penyebab manual retry gagal bila session login ERP masih tersedia; token statis tetap disarankan untuk cron production.
- Auto-create customer hanya aktif jika `ANIKA_ERP_AUTO_CREATE_CUSTOMER=true`.
- SLM tidak memakai fallback `WALK-IN` untuk sales AJ; `customer_id` harus berasal dari customer existing atau customer yang baru dibuat otomatis.
- Domain email customer otomatis dikonfigurasi dengan `ANIKA_ERP_AUTO_CUSTOMER_EMAIL_DOMAIN`.
- Default harga modal produk manual untuk QA/production dikonfigurasi dengan `ANIKA_ERP_DEFAULT_PRODUCT_COST_PRICE`; nilai kosong berarti produk manual AJ tanpa harga modal akan diblokir sebelum create ERP.
