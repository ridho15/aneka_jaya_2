# SLM Internal App

Aplikasi operasional internal berbahasa Indonesia untuk input penjualan, pengeluaran, dan data barang. Dibangun dengan Next.js 16 App Router, TypeScript, Tailwind CSS, React Hook Form, Zod, Vitest, dan fondasi PostgreSQL/Prisma.

## Menjalankan aplikasi

1. Pastikan Node.js 20.9 atau lebih baru tersedia.
2. Salin `.env.example` menjadi `.env.local`.
3. Jalankan `npm install`.
4. Jalankan `npm run dev`, lalu buka `http://localhost:3000`.

Mode awal adalah `mock`, sehingga seluruh alur dapat dicoba tanpa ERP, OpenCloud, atau WhatsApp produksi:

- input penjualan Cash/TF/Tempo/Other (termasuk multi-barang, hitung total, dan pemulihan draf bila kirim gagal);
- input pengeluaran dan unggah lampiran mock;
- tambah, cari, edit barang, dan minimum stock alert mock;
- approval, tempo payment, audit trail, WhatsApp report mock, dashboard dan riwayat aktivitas mock.

## Konfigurasi ERP produksi

Untuk memakai akun Anika ERP langsung pada halaman login, gunakan `AUTH_PROVIDER=anika_erp`.
Email dan password diteruskan server-side ke `/api/integrations/auth/login`; aplikasi tidak menyimpan password.
Bearer token hasil login disimpan dalam cookie `HttpOnly` selama masa berlakunya dan digunakan untuk request ERP user tersebut.

Untuk produksi, atur variabel berikut di `.env.local` atau di platform deployment:

```env
NEXT_PUBLIC_APP_MODE=production
AUTH_PROVIDER=anika_erp
ANIKA_ERP_API_BASE_URL=https://ankjy.playgo.id/api/integrations
# Opsional untuk proses server tanpa sesi user:
ANIKA_ERP_API_TOKEN=
```

`ANIKA_ERP_API_TOKEN` hanya dibaca pada server. Browser tidak pernah memanggil URL ERP langsung; semua permintaan diproses melalui route handler Next.js di `app/api` dan pembungkus server di `lib/api`.

Tujuan transaksi ERP:

- Input Penjualan dikirim sebagai penjualan Neo dengan `auto_create_invoice`, sehingga masuk ke **Invoice Penjualan**.
- Input Data Barang dikirim sebagai `import_products`; `initial_stock` dan `warehouse` diteruskan agar stok awal dicatat. Gudang default adalah **Toko**.
- Input Pengeluaran dikirim melalui envelope Neo sebagai instruksi **Buat Transaksi Kas & Bank**, transaksi keluar dengan COA **Kas**. Ini memakai teks Neo yang terdokumentasi karena OpenAPI yang tersedia belum mendeklarasikan body endpoint pengeluaran langsung.

Endpoint ERP yang dipakai atau disiapkan:

- `GET /products` untuk daftar barang dan pemeriksaan koneksi;
- `POST /neo/commands` untuk pembuatan penjualan dan barang;
- `GET /stocks` serta `GET /invoices` tersedia dalam adapter untuk pengembangan lanjutan;
- `PUT /products/{product}` untuk pembaruan barang. OpenAPI resminya meminta `product_category_id`, `uom_id`, dan `kode_merk`; aplikasi mempertahankan ID yang dikembalikan ERP dan berhenti aman bila referensi itu tidak tersedia;
- pengeluaran pada produksi juga tidak akan berpura-pura berhasil, karena endpoint finance belum ada di cuplikan dokumentasi yang diberikan.

Payload penjualan dan barang terisolasi di `lib/api/sales.ts` dan `lib/api/products.ts`. Jika skema OpenAPI final tersedia, ubah hanya adapter tersebut dan `lib/api/expenses.ts`—form UI tidak perlu ditulis ulang.

Target penjualan ditentukan terpisah dari mode aplikasi:

```env
SALES_ERP_TYPE_CODES=AJ
```

Dengan konfigurasi default tersebut, hanya tipe AJ yang dikirim ke Neo/Anika ERP. Tipe non-AJ disimpan di sistem lokal. Owner dapat menandai transaksi tipe ERP sebagai transaksi pengujian; sistem menambahkan referensi `TEST-AJ-*` pada customer dan catatan agar mudah ditemukan untuk penghapusan manual di ERP.

Adapter Neo memakai envelope `NeoCommandRequest` yang didokumentasikan (`text`, `message_id`, `source`, dan `parsed_intent`). Pembuatan barang dikirim sebagai `import_products` dengan referensi kategori, satuan, gudang, dan rak yang dapat dibaca manusia, sesuai skema Neo.

## OpenCloud

Atur `OPENCLOUD_API_BASE_URL`, `OPENCLOUD_PROJECT_ID`, `OPENCLOUD_API_KEY`, dan `OPENCLOUD_STORAGE_BUCKET` saat detail API OpenCloud tersedia. Upload memvalidasi PDF/JPG/JPEG/PNG/WEBP dan membatasi ukuran default hingga 5 MB (`OPENCLOUD_MAX_FILE_SIZE_BYTES` dapat diatur).

Dalam mode mock, unggahan menghasilkan URL mock. Dalam mode produksi, aplikasi menolak unggahan dengan pesan yang jelas sampai mapping API OpenCloud dikonfirmasi; file tidak disimpan secara diam-diam.

## Dokumentasi API dan cetak dot matrix

Dokumentasi API formal tersedia untuk Owner:

- `GET /api/docs` menampilkan halaman dokumentasi ringkas.
- `GET /api/docs/openapi.json` mengembalikan OpenAPI JSON dari `docs/openapi.yaml`.

Dokumentasi mencakup endpoint transaksi, produk/stok, approval, tempo, upload, settings, cron job, dan preview cetak. Response API bisnis memakai pola umum `{ success, data }` atau `{ success: false, message, code, details }`.

Preview cetak dot matrix tersedia sebagai teks fixed-width 80 kolom:

- `GET /api/print/sales/{id}` untuk nota Penjualan.
- `GET /api/print/tempo/{id}` untuk bukti pembayaran Tempo.

Halaman browser-print tersedia di:

- `/print/sales/{id}` untuk nota Penjualan dengan tombol `Print`.
- `/print/tempo/{id}` untuk bukti pembayaran Tempo dengan tombol `Print`.
- Tambahkan `?auto=1` untuk memanggil dialog print otomatis setelah preview selesai dimuat.

Output endpoint print adalah `text/plain`, bukan PDF dan belum mengirim raw command ke printer fisik. Untuk uji printer dot matrix asli, buka halaman print sebagai role yang berhak, pilih browser print, gunakan font monospace, kertas continuous form, dan mode printer draft/condensed bila diperlukan. Catat hasil margin kiri, potong kanan, jumlah kolom, line spacing, dan alignment total. Default tetap 80 kolom; perubahan ke 72/96/132 kolom dilakukan setelah hasil uji printer fisik. Integrasi direct print berikutnya perlu memilih pendekatan: browser print, local print agent, atau server-side raw printer.

## Identity, role, approval, tempo, WhatsApp, dan laporan

Role utama:

- **Owner**: full access, termasuk Dashboard, Approval, Tempo, Reports, ERP Sync, Audit Trail, Settings, WhatsApp Settings.
- **Admin**: hanya Input Penjualan, Input Pengeluaran, dan Stock Barang/Data Barang.
- **Finance**: Input Pengeluaran, Input Pembelian, Tempo, Pembayaran Tempo, dan Laporan Finance.
- **Manager**: Approval, Tempo View, dan limited reports.
- **Viewer**: default tanpa akses sampai Owner memberi akses pada sistem identity produksi.

Permission dipusatkan di `lib/auth/roles.ts` melalui helper `can(role, permission)`. Route protection ada di `proxy.ts` dan API penting juga mengecek permission server-side.

Identity dipusatkan di `lib/auth/session.ts` melalui `getCurrentUser()` dan `getCurrentRole()`.

- `AUTH_PROVIDER=demo` memakai cookie role internal dan hanya aman untuk local/mock.
- `AUTH_PROVIDER=trusted_header` membaca header user yang sudah diverifikasi oleh reverse proxy/SSO upstream: `x-aneka-user-id`, `x-aneka-user-name`, dan `x-aneka-user-role`.
- Di production, demo role otomatis jatuh ke Viewer kecuali `AUTH_ALLOW_DEMO_IN_PRODUCTION=true`, yang tidak disarankan.
- Untuk production trusted header, `AUTH_TRUSTED_HEADER_SECRET` wajib diisi dan upstream wajib mengirim `x-aneka-auth-secret` yang sama.
- `/` dan `/login` adalah landing autentikasi internal. Tombol "Masuk melalui SSO" hanya tampil jika `AUTH_SSO_LOGIN_URL` diisi; jika kosong, halaman menampilkan pesan konfigurasi SSO.
- User management production memakai Prisma `User`; role database mengalahkan role header dan hanya user aktif yang dapat memakai aplikasi.

Audit trail bersifat append-only di PostgreSQL untuk production dan di `data/audit-trail.json` untuk mock/local mode. JSON store tetap dipertahankan untuk mock/local fallback dan legacy import, bukan source of truth transaksi finansial production. Fondasi database produksi tersedia di `prisma/schema.prisma` dan migration untuk user management serta data operasional:

- User
- BookkeepingType, RekeningAccount, RekeningAccountBookkeepingType
- SalesRecord, SalesRecordItem
- AuditLog, ApprovalRequest, TempoReceivable, TempoPayment
- WhatsAppRecipient, WhatsAppMessageLog
- StockAlertLog

Untuk menjalankan PostgreSQL lokal production-like:

```bash
docker compose up -d postgres
docker compose --profile tools run --rm db-migrate
docker compose --profile tools run --rm db-seed-owner
docker compose --profile tools run --rm db-import
docker compose --profile tools run --rm db-verify
```

`db-import` mengimpor file JSON legacy yang tersedia secara idempotent ke tabel Prisma awal dan menampilkan ringkasan imported/skipped/failed per entity. Di mode production, flow Penjualan, item Penjualan, Approval, Tempo, Audit utama, Tipe, dan Rekening memakai Prisma/PostgreSQL; JSON store dipertahankan untuk mock/local, legacy import, dan modul yang belum final.
`db:seed-owner` membuat Owner pertama dari `INITIAL_OWNER_EXTERNAL_ID`, `INITIAL_OWNER_EMAIL`, dan `INITIAL_OWNER_NAME` bila belum ada Owner aktif.
Runbook production-like lengkap tersedia di `docs/production-like-verification-runbook.md`.
Setelah app production-like berjalan, jalankan `npm run deploy:smoke-auth` dengan `APP_BASE_URL=http://localhost:3000` dan env trusted-header untuk memverifikasi redirect `/login`, SSO URL, dan akses Owner seeded.

Tempo tidak masuk Grand Total sampai dibayar. Daily WhatsApp report mengelompokkan Cash/TF per Tipe dan selalu menampilkan open Tempo sampai Paid, Cancelled, atau Written Off.

## WhatsApp dan cron

Provider WhatsApp dipilih melalui `WHATSAPP_PROVIDER=mock|meta_cloud_api|third_party`. Jangan gunakan WhatsApp Web scraping untuk production automation.

Job routes:

- `POST /api/jobs/send-daily-report`
- `POST /api/jobs/send-tempo-reminder`
- `POST /api/jobs/check-stock-alert`
- `POST /api/jobs/retry-erp-sync`

Semua job route wajib membawa `x-cron-secret: CRON_SECRET` atau query `?secret=...`.

## Deployment OpenCloud

Proyek bersifat deployment-friendly: semua rahasia menggunakan environment variables, API ERP berada di server, dan penyimpanan file berada di balik abstraksi OpenCloud. Tambahkan environment variables yang sama pada layanan OpenCloud, lalu jalankan build standar:

```bash
npm run build
npx prisma generate
npm run start
```

## Smoke test setelah perbaikan

Jalankan aplikasi dalam mode mock, lalu verifikasi alur berikut sebelum deploy:

- Admin membuat Penjualan dengan metode Tempo.
- Owner atau Manager membuka Approval dan approve transaksi tersebut.
- Finance atau Owner membayar sebagian Tempo.
- Owner membuka Dashboard dan memastikan nominal Tempo masih muncul sebagai piutang terbuka.
- Role Finance/Admin/Owner dapat mengunggah lampiran, sedangkan Viewer/Manager menerima 403.
- `GET /api/products` berhasil untuk Owner/Admin dan 403 untuk Viewer/Finance/Manager.

Verifikasi otomatis minimum:

```bash
npm run lint
npm test
npm run build
npm audit
npx prisma format
npx prisma generate
```

Jangan menjalankan `npm audit fix --force` tanpa review dependency karena dapat membawa breaking changes.

### Container deployment

The project includes `Dockerfile` and `docker-compose.yml`. Set the production ERP variables in `.env.local`, then deploy with a platform that supports Docker and a persistent `/app/data` volume for audit records. The application listens on port `3000`.

`docker-compose.yml` also provides a `postgres` service for local production-like testing and the `aneka_jaya_postgres` volume. For real production, use managed PostgreSQL or a database volume with backup/restore procedures; do not rely on an ephemeral container filesystem.

Database migration is intentionally container-first. Run `docker compose --profile tools run --rm db-migrate` before starting or updating the app, then run `db-import` if legacy JSON data must be copied into PostgreSQL, and finish with `db-verify`. This avoids relying on host-local Prisma behavior and matches the network topology used by Docker/CI.

## Catatan keamanan

- Jangan memasukkan `.env.local` ke repositori.
- Jangan gunakan variabel yang diawali `NEXT_PUBLIC_` untuk token atau API key.
- Validasi dilakukan di browser untuk kenyamanan dan kembali di server sebelum data diteruskan ke integrasi.
- Pesan error ke pengguna tidak memuat stack trace atau token.

## Peran dan data ERP terkini

- **Owner**: akses dashboard, Data Barang dengan quantity ERP terkini, Approval, Tempo, Reports, ERP Sync, Audit Trail, dan Pengaturan.
- **Admin**: hanya dapat menginput Penjualan, Pengeluaran, dan Stock Barang/Data Barang; tidak dapat membuka dashboard, settings, reports, audit trail, maupun ERP Sync.
- **Finance**: tidak dapat membuka dashboard; dapat membayar Tempo dan melihat laporan finance.
- **Manager**: tidak dapat membuka dashboard; dapat approve/reject dan melihat laporan terbatas.
- Daftar barang dan Stok Barang menarik data terbaru dari ERP di mode produksi (`GET /products` dan `GET /stocks`), dengan polling browser setiap 30 detik untuk menjaga tampilan tetap mutakhir.

Audit trail menyimpan actor, role snapshot, waktu, entity, action, before/after value, dan alasan/tujuan pada `data/audit-trail.json` selama fase JSON/mock. Pastikan folder `data` ditempatkan di persistent volume pada deployment sampai operasi bisnis berpindah penuh ke Prisma. Struktur peran demo menggunakan cookie internal hanya untuk non-production; production deployment harus memakai `AUTH_PROVIDER=trusted_header` di belakang SSO/reverse proxy terpercaya atau mengganti adapter `lib/auth/session.ts` dengan provider session resmi.
# aneka_jaya_2
