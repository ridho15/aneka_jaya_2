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
