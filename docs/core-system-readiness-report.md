# Laporan Kesiapan Sistem Inti

Tanggal pemeriksaan: 29 Juni 2026

## Keputusan

**Siap untuk UAT bisnis setelah login operasional, ERP, dan master data asli dikonfigurasi. Belum dapat dinyatakan siap operasional final.**

Implementasi aplikasi, kontrol akses, empty/error state, dan pencegahan mock telah lulus verifikasi otomatis. UAT live yang memakai produk dan stok asli belum dapat dilakukan karena `ANIKA_ERP_API_BASE_URL` dan `ANIKA_ERP_API_TOKEN` belum tersedia. Login operasional juga harus memakai `AUTH_PROVIDER=trusted_header` dengan SSO/reverse proxy atau auth gateway sementara dan user aktif di database; role selector demo bukan jalur masuk operasional. Tipe pembukuan dan rekening asli juga belum dibuat.

OpenCloud, WhatsApp, cron, dan deployment production tidak menjadi bagian keputusan kesiapan fase ini.

## Eksekusi Plan Lanjutan

Status eksekusi: **Terblokir pada aktivasi login operasional dan ERP asli**.

Plan lanjutan telah dijalankan sampai batas yang memungkinkan di workspace development. Environment saat ini belum memiliki `ANIKA_ERP_API_BASE_URL` dan `ANIKA_ERP_API_TOKEN`, sehingga UAT produk, stok, penjualan, pengeluaran, approval, tempo, dashboard, laporan, cetak, dan audit trail dengan data ERP asli belum boleh dilanjutkan. Login operasional juga harus melewati SSO/reverse proxy atau auth gateway sementara yang mengirim trusted header dan cocok dengan user aktif pada tabel `User`. Sesuai kriteria plan, kondisi ini menjadi blocker utama sebelum transaksi UAT dibuat.

Data lokal juga belum berisi master data bisnis atau transaksi UAT. Super Admin perlu membuat tipe pembukuan dan rekening resmi setelah ERP aktif. Tidak ada data master atau transaksi otomatis yang dibuat oleh sistem.

## Seeder dan Readiness Data

Seeder lengkap semua tabel tidak disediakan karena akan berisiko membuat data contoh. Seeder wajib hanya `db:seed-owner` untuk bootstrap Super Admin pertama.

| Data | Status | Cara tersedia |
| --- | --- | --- |
| User OWNER | Diseed minimal | `npm run db:seed-owner` memakai `INITIAL_OWNER_EXTERNAL_ID` |
| BookkeepingType | Manual | Dibuat Super Admin dari Settings Tipe |
| RekeningAccount | Manual | Dibuat Super Admin dari Settings Rekening |
| RekeningAccountBookkeepingType | Manual | Terbuat dari assignment rekening ke tipe |
| Sales/Tempo/Approval/Audit | Aktivitas nyata | Terbuat dari UAT/transaksi user atau migrasi legacy yang disetujui |
| Produk dan stok | ERP asli | Tidak disimpan sebagai seed lokal |
| WhatsApp/Stock alert log | Aktivitas nyata | Terbuat hanya saat integrasi/alert berjalan |

Gunakan `npm run db:verify` untuk memastikan semua model Prisma tersedia. Gunakan `npm run app:check-core-readiness` untuk memastikan syarat minimum penggunaan inti sudah lengkap.

## Hasil Verifikasi

| Area | Status | Hasil |
| --- | --- | --- |
| Super Admin | Lulus | Nilai internal `OWNER`, label UI Super Admin, seluruh permission aktif diberikan |
| Navigasi aktif | Lulus | Seluruh menu operasional tampil untuk Super Admin |
| Pembelian | Ditunda | Menu, permission, dan proxy rule telah dihapus; akses langsung selalu menghasilkan 404 |
| Mock runtime | Lulus | Tidak ada import fixture/mock, provider simulasi, seed master data, atau fallback sukses palsu |
| Empty state | Lulus | Dashboard, kategori, aktivitas, dan master data aman saat kosong |
| ERP error state | Lulus | Produk dan stok mengembalikan error konfigurasi tanpa data pengganti |
| Dashboard | Lulus otomatis | KPI, grafik, kategori, dan aktivitas menggunakan transaksi/audit tersimpan |
| Role lain | Lulus otomatis | Permission server dan proxy tetap membatasi akses |
| Unit test | Lulus | 27 file, 88 test |
| Browser UAT | Lulus otomatis | 6 skenario desktop/mobile, termasuk Super Admin dan route Pembelian 404 |
| Lint dan build | Lulus | ESLint, TypeScript, dan Next.js production build berhasil |
| Login operasional | Terblokir | Auth gateway sementara disiapkan, tetapi user gateway dan user database asli belum dibuat |
| Readiness data inti | Terblokir | Menunggu Owner aktif, tipe, rekening, relasi rekening-tipe, ERP, dan auth operasional lengkap |
| ERP live | Terblokir | Credential ERP belum tersedia |
| Master data bisnis | Terblokir | Tipe dan rekening asli belum diinput |
| UAT transaksi nyata | Menunggu | Dilakukan setelah ERP dan master data tersedia |

## UAT Bisnis yang Harus Diselesaikan

1. Konfigurasi SSO/reverse proxy atau auth gateway sementara, trusted header secret, dan URL login.
2. Buat user gateway dan user Super Admin aktif di tabel `User` dengan `externalId` yang sama dengan header login.
3. Isi credential ERP pada environment development/staging.
4. Login sebagai Super Admin dari jalur SSO/reverse proxy atau auth gateway sementara dan buat tipe pembukuan serta rekening kas/bank asli.
5. Jalankan `npm run app:check-core-readiness` sampai lulus.
6. Cocokkan daftar produk dan stok aplikasi dengan respons ERP.
7. Tambah dan edit satu barang uji yang telah disetujui untuk staging ERP.
8. Buat penjualan Cash, Transfer, dan Tempo.
9. Buat pengeluaran tanpa lampiran.
10. Buat transaksi sebagai Admin, lalu approve/reject sebagai Manager atau Super Admin.
11. Bayar Tempo sebagian lalu lunas.
12. Cocokkan dashboard, laporan, cetak, dan audit trail dengan transaksi UAT.
13. Ulangi akses sebagai role lain untuk memastikan pembatasan tetap berlaku.

Setiap transaksi UAT harus menggunakan identitas/reference yang disetujui bisnis dan dibersihkan sesuai prosedur staging ERP. Sistem tidak akan membuat data contoh otomatis.

## Catatan Data Historis

`data/audit-trail.json` masih menyimpan tiga entri simulasi historis dari sebelum remediasi. Entri tersebut difilter oleh store audit dan tidak ditampilkan pada audit trail, dashboard, laporan, atau API pembaca. File tidak dihapus untuk menghindari penghapusan riwayat tanpa persetujuan pemilik data.

## Kriteria Siap Operasional Final

Status dapat diubah menjadi **Siap Digunakan** setelah seluruh UAT bisnis di atas lulus dengan login operasional, ERP asli, tipe dan rekening asli telah tersedia, tidak ada perbedaan data antara aplikasi dan ERP, serta tidak ditemukan defect yang menghambat transaksi inti.
