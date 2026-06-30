# Audit Kontrak ERP Sales Aneka Jaya

Tanggal audit: 2026-06-30

Sumber kontrak: `https://ankjy.playgo.id/integrations/openapi.yaml`

## Temuan Utama

- Endpoint resmi untuk membuat penjualan adalah `POST /sales`.
- `CreateSaleRequest` mewajibkan `customer_id` dan `items`.
- `SaleItemRequest` mewajibkan `product_id`, `quantity`, dan `unit_price`.
- Payload lama SLM melalui `/neo/commands` memakai `customer_name` dan `product_ref`, sehingga belum cukup aman untuk create sales AJ.

## Keputusan Implementasi

- Transaksi tipe `AJ` dikirim memakai adapter resmi `POST /sales`.
- Customer harus bisa di-resolve ke `customer_id` dari `/customers`.
- Jika customer manual tidak ditemukan, SLM memakai fallback customer ERP dari `ANIKA_ERP_FALLBACK_CUSTOMER_CODE` agar transaksi tetap valid.
- Item barang harus memakai ERP `product_id`; bila transaksi lama hanya punya kode barang, sistem resolve ulang dari `/products`.
- Jika customer atau produk tidak ditemukan, transaksi tetap `failed` di ERP Sync dengan pesan operasional aman.
- Sistem tidak auto-create customer ERP pada fase ini.

## Payload Minimum yang Dipakai SLM

```json
{
  "customer_id": 77,
  "order_date": "2026-06-30",
  "delivery_date": "2026-06-30",
  "shipped_to": "Ridho Manual - Toko",
  "tipe_pengiriman": "di Tempat",
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

## Catatan Keamanan

- Token, session, payload penuh, dan response mentah ERP tidak ditampilkan di browser.
- `ANIKA_ERP_API_TOKEN` kosong bukan penyebab manual retry gagal bila session login ERP masih tersedia; token statis tetap disarankan untuk cron production.
- Auto-create customer harus menunggu keputusan bisnis karena endpoint `/customers` memiliki banyak field wajib.
- Production wajib memastikan customer fallback ERP tersedia, misalnya `code=WALK-IN` dan `name=Customer Umum`.
- Konfigurasi fallback di SLM: `ANIKA_ERP_FALLBACK_CUSTOMER_CODE=WALK-IN`.
