# Integrasi MJ → SLM

Integrasi ini menerima invoice MJ melalui Bearer token server-to-server, menyimpan snapshot lokal secara idempotent, lalu menjalankan tahap customer AJ, invoice AJ, release stok, dan pembayaran AJ secara berurutan. Setiap tahap yang sukses tidak dipanggil ulang saat retry. Request jaringan AJ tidak pernah ditahan di dalam transaksi database dan memiliki timeout 12 detik.

## Deployment

1. Jalankan `npm run db:migrate:deploy` lalu `npm run prisma:generate`.
2. Atur `MJ_INTEGRATION_ENVIRONMENT=sandbox` pada sandbox atau `production` pada production. Token dari environment lain selalu ditolak.
3. Opsional: atur `MJ_RATE_LIMIT_MUTATION_PER_MINUTE` (default 60) dan `MJ_RATE_LIMIT_READ_PER_MINUTE` (default 300).
4. Provision token sandbox sekali dengan `npm run integration:token:provision -- --client=mj --environment=sandbox`. Secret hanya tampil sekali; SLM hanya menyimpan hash SHA-256 dan prefix.
5. Untuk rotasi, provision token baru dengan `--rotate-from=<token-id>`, pindahkan MJ ke token baru, lalu cabut token lama dengan mengubah `IntegrationToken.isActive=false` dan mengisi `revokedAt`. Production token baru boleh diterbitkan setelah smoke test sandbox berhasil.

## Idempotency dan retry

`source=MJ` dan `external_reference` membentuk unique key. Payload dikanonisasi dan di-hash. Duplicate dengan hash sama melanjutkan tahap berstatus `pending`/`failed`; duplicate dengan hash berbeda mendapat `409 REFERENCE_CONFLICT`. Referensi AJ deterministik: `MJ-INVOICE-{external_reference}`, release berbasis referensi invoice, dan `MJ-PAY-{external_reference}-{payment_reference}`.

Kegagalan AJ menghasilkan `502 AJ_UPSTREAM_ERROR` atau `504 AJ_TIMEOUT`, termasuk `slm_id`, substatus, error terakhir, serta `retryable=true`. Endpoint cancel sengaja selalu menjawab `501 AJ_CONTRACT_PENDING` dan tidak mengubah data.

## Akses UI dan smoke test

Invoice bersumber MJ terlihat pada riwayat penjualan dengan penanda `Source MJ`, tetapi detail dan cetak browser hanya dapat dibuka Owner. Admin dan role lain disaring di query sekaligus diperiksa ulang saat membuka detail/cetak.

Urutan smoke test sandbox: create → lookup → duplicate payload sama → simulasi timeout AJ → retry → cetak text/PRN/browser. OpenAPI lengkap tersedia di `/api/docs` dan `/api/docs/openapi.json`.
