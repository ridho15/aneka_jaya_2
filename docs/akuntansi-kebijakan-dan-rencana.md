# Akuntansi SLM: kebijakan, matriks posting, dan rencana perbaikan

Status dokumen: **draf untuk persetujuan pemilik**. Belum ada saldo produksi yang diubah.
Butir bertanda **[PERLU KEPUTUSAN]** tidak akan diterapkan sebelum pemilik memilih.

## 1. Konteks yang sudah dikonfirmasi

- SLM milik perorangan, saat ini non-PKP.
- Buku mencakup aktivitas AJ, MJ, SLM, dan LRM. Keempatnya diperlakukan sebagai label operasional (tipe) dalam satu wajib pajak, sampai ada bukti batas kepemilikan atau wajib pajak yang berbeda.
- "Gaji Direktur" yang dibayar ke pemilik = Prive Pemilik.
- Pinjaman staf yang ditinjau sudah lunas. Riwayat pelunasan atau potong gaji harus dicatat dulu sebelum akun pinjaman dianggap rekonsiliasi.
- Dua catatan gaji September yang tumpang-tindih adalah pembayaran terpisah, jadi keduanya dipertahankan.
- Usaha belum berjalan di 2025. Tanggal mulai 2026 **belum dikonfirmasi**.
- Saldo awal kas, persediaan, piutang, dan utang **belum diketahui**. Statusnya tetap "belum diselesaikan", tidak diisi nol.
- Perubahan yang harus dipertahankan:
  - 36 akun aktif,
  - 88 reklasifikasi gaji staf,
  - 132 koreksi pemetaan akun pengeluaran,
  - jurnal manual JRN-202611-0177 (koreksi Rp75.000 untuk invoice 051126-17 Ilyas).

## 2. Temuan pada mesin akuntansi saat ini

| # | Masalah | Lokasi kode | Status |
|---|---|---|---|
| 1 | Pembalikan jurnal terhitung dua kali (jurnal asli disembunyikan, pembaliknya tetap dihitung) | `lib/accounting/journalStore.ts` + filter `POSTED` di buku besar & laporan | **Diperbaiki** (commit 8dadd2b), dengan test database |
| 2 | Edit invoice yang sudah diposting tidak memperbarui jurnalnya. Posting ulang juga mengembalikan jurnal lama karena kunci idempotensi | `lib/sales/store.ts` `updateSalesRecordInner`, `journalStore.ts:77` | Fase 1 |
| 3 | HPP memakai harga modal standar (RMB × kurs), bukan biaya rata-rata dari mutasi stok. Fallback **85% dari harga jual** tanpa label estimasi | `lib/sales/postingHooks.ts:355-391` | Fase 1 (hapus fallback, tandai "HPP belum lengkap") |
| 4 | Barang masuk (GRN), opname, adjustment, dan transfer tidak membuat jurnal. Persediaan hanya naik saat invoice pembelian diposting | `lib/inventory/service.ts`, `lib/purchasing/postingHooks.ts` | Fase 2 |
| 5 | Semua rekening bank memakai satu akun 1-1001. Tautan rekening→akun tidak pernah diisi aplikasi. Pengeluaran selalu mengkredit 1-1001 | `lib/business/masterData.ts:151`, `lib/accounting/postingHooks.ts` | Fase 1 |
| 6 | Edit atau batal pengeluaran tidak membalik/memposting ulang jurnal | `lib/expenses/store.ts:205,259` | Fase 1 |
| 7 | Batal penjualan tempo tidak membalik jurnal pelunasan tempo. DP awal tidak punya jurnal sendiri | `lib/sales/store.ts:795`, `lib/tempo/store.ts` | Fase 2 |
| 8 | Tidak ada akun/kategori Prive. Neraca hanya menjumlah 3-1001 + 3-1002, jadi akun ekuitas lain tidak masuk total | `lib/reports/financialStatements.ts:426` | Fase 1 |
| 9 | Laba Rugi mengelompokkan beban dengan kode tetap 6-1001..6-1006 | `financialStatements.ts:87` | Fase 1 |
| 10 | Nama "PT SURYA LOGAM MULIA" tertulis langsung di kode | `IncomeStatementViewer.tsx:117`, `BalanceSheetViewer.tsx:137` | Fase 1 (identitas usaha diatur terpusat) |
| 11 | Form edit akun sistem terbuka dengan nama kosong karena state modal tidak di-reset | `components/accounting/AccountModal.tsx:29` | Fase 1 |
| 12 | Memo per baris jurnal manual hilang (field `description` vs `memo`) | `ManualJournalModal.tsx:103` | Fase 1 |
| 13 | Pratinjau posting historis dibatasi 500 baris. Pembelian barang dari menu Pengeluaran dipetakan ke beban | `lib/accounting/reconciliationStore.ts` | Fase 3 |
| 14 | Neraca saldo seimbang ditampilkan seolah "valid" walau masih ada transaksi belum terposting | Rekonsiliasi | Fase 1 (pisahkan "Debit = Kredit" dari "Semua terposting & terekonsiliasi") |
| 15 | Gaji tidak diakru. Potong gaji mendebit 2-1002 sehingga saldonya bisa terbalik | `lib/sdm/*` | Fase 2 |

Angka produksi di laporan review (633 pengeluaran Rp477.985.175 belum dijurnal, selisih piutang Rp237.843.285, persediaan −Rp254.029.694) **belum saya lihat langsung**. Sesi ini tidak punya akses ke database produksi. Dry-run Fase 3 akan menghitung ulang angka-angka tersebut di server.

## 3. Kebijakan akuntansi (usulan)

| Kebijakan | Usulan | Keputusan |
|---|---|---|
| Dasar pencatatan | Akrual. Pendapatan diakui saat invoice final disimpan (bukan draft) | Usulan |
| Persediaan | Perpetual, per produk dan lokasi | Usulan |
| Metode biaya persediaan | Rata-rata tertimbang bergerak (moving average). Modul inventory sudah menyimpan `avgCost` per saldo | **[PERLU KEPUTUSAN]** moving average atau FIFO |
| Saat HPP diakui | Saat stok dipotong (sama dengan saat penjualan final disimpan). Biaya = rata-rata di lokasi pada saat itu. Kalau biaya belum ada: penjualan tetap tersimpan, HPP ditandai **"HPP belum lengkap"**, tanpa persentase | Usulan |
| Ongkos angkut & biaya impor masuk | Dikapitalisasi ke persediaan (landed cost) | **[PERLU KEPUTUSAN]** alokasi berdasarkan nilai atau kuantitas |
| Ongkos kirim ke customer | Beban pengiriman | Usulan |
| Peralatan usaha | Dicatat sebagai aset tetap | **[PERLU KEPUTUSAN]** batas minimal kapitalisasi, metode & umur penyusutan. Sebelum diputuskan: aset dicatat tanpa penyusutan dan ditandai |
| Uang muka ke supplier | Aset "Uang Muka Pembelian" sampai barang/invoice diterima | Usulan |
| DP / titipan / kelebihan bayar customer | Liabilitas "Uang Muka & Titipan Pelanggan", bukan pendapatan | Usulan |
| Biaya dibayar pribadi oleh pemilik | Beban diakui sekali, lawan "Utang kepada Pemilik"; penggantian melunasi utang itu | Usulan |
| Penarikan pemilik & gaji direktur | Prive Pemilik (ekuitas), tidak mengurangi laba operasional | Dikonfirmasi |
| Valuta asing | Kurs transaksi. Selisih saat pelunasan → laba/rugi selisih kurs | **[PERLU KEPUTUSAN]** sumber kurs (kurs input transaksi / kurs BI) dan perlu revaluasi akhir bulan atau tidak |
| PPN (non-PKP) | Tidak memungut PPN keluaran. PPN masukan dimasukkan ke biaya perolehan. Fitur `[PPN: …]` dari catatan dinonaktifkan | Usulan (sesuai non-PKP) |
| PPh | **Tidak ditebak** dari status non-PKP | **[PERLU KEPUTUSAN]** rezim PPh (mis. PP 55/2022 final 0,5% atau tarif umum) dan tanggal mulai 2026 |
| Pembulatan | Rupiah bulat per baris jurnal. Qty 2 desimal, biaya satuan 4 desimal, kurs 4 desimal. Selisih pembulatan ke baris terakhir | Usulan |
| Identitas usaha | Nama, pemilik, status pajak, dan tanggal efektif diatur di Pengaturan, dipakai semua laporan | **[PERLU KEPUTUSAN]** nama yang ditulis di laporan |
| Entitas AJ/MJ/SLM/LRM | Label operasional dalam satu buku | **[PERLU KEPUTUSAN]** konfirmasi tidak ada wajib pajak terpisah |

## 4. Status transaksi (dipisah)

| Status | Nilai |
|---|---|
| Persetujuan | Draft, Final, Dibatalkan |
| Pembayaran | Belum bayar, Sebagian, Lunas, Lebih bayar |
| Pengiriman | Belum diproses, Siap kirim, Selesai sebagian, Selesai |
| Akuntansi | **Draft**, **Perlu informasi** (mis. HPP belum lengkap, akun belum dipetakan), **Terposting**, **Dibalik** |

## 5. Matriks posting

Kunci idempotensi setiap baris: `sumber / id / jenis posting / versi`. Edit membuat versi baru: versi lama dibalik, versi baru diposting. Riwayat tetap utuh.

| Transaksi | Pemicu | Debit | Kredit | Detail pihak | Bukti | Edit / retur / batal |
|---|---|---|---|---|---|---|
| Penjualan tunai/TF | Invoice final | Kas/Bank rekening penerima | Penjualan | Rekening | Nota | Edit: balik versi lama + posting versi baru. Batal: balik |
| Penjualan Split | Invoice final | Kas (bagian cash) + Bank (bagian TF) | Penjualan | Rekening | Nota | Sama |
| Penjualan tempo | Invoice final | Piutang Usaha (+ Kas/Bank untuk DP) | Penjualan | Customer | Nota | Sama |
| Pelunasan piutang | Pembayaran tempo | Kas/Bank | Piutang Usaha | Customer, rekening | Bukti bayar | Balik pembayaran |
| Kelebihan bayar customer | Pembayaran > sisa | Kas/Bank | Piutang + Titipan Pelanggan | Customer | Bukti bayar | Refund mendebit Titipan |
| HPP | Stok dipotong | HPP | Persediaan Barang Dagang (1-1005) | Produk, lokasi | Mutasi stok | Retur/batal: balik di nilai biaya asal |
| Retur penjualan | Retur diposting | Retur Penjualan | Piutang / Kas | Customer | Nota retur | – |
| Barang masuk dari pembelian | Penerimaan barang (GRN) | Persediaan | Utang Barang Diterima (belum ditagih) | Supplier, produk | GRN | Batal GRN: balik |
| Invoice supplier | Invoice diposting | Utang Barang Diterima (+ selisih ke Persediaan) | Utang Usaha | Supplier | Invoice | Balik |
| Pembelian peralatan | Invoice | Aset Tetap | Utang Usaha / Kas | Supplier | Invoice | Balik |
| Pembelian bahan kemasan/jasa | Invoice/pengeluaran | Persediaan Bahan Kemasan atau Beban | Utang Usaha / Kas | Supplier | Invoice | Balik |
| Uang muka ke supplier | Pembayaran | Uang Muka Pembelian | Kas/Bank | Supplier | Bukti transfer | Dikompensasi ke invoice |
| Pembayaran supplier | Pembayaran | Utang Usaha | Kas/Bank (± selisih kurs) | Supplier, rekening | Bukti bayar | Balik |
| Ongkos angkut/impor masuk | Invoice biaya | Persediaan (dialokasikan) | Utang/Kas | Supplier | Invoice | Balik |
| Pengeluaran operasional | Pengeluaran final | Beban sesuai tujuan | Kas/Bank sumber | Penerima | Nota/foto | Edit: balik + posting ulang |
| Dibayar pribadi oleh pemilik | Pengeluaran "dibayar pemilik" | Beban | Utang kepada Pemilik | Pemilik | Nota | Penggantian: Dr Utang kepada Pemilik / Cr Kas |
| Pinjaman staf | Pencairan | Piutang Karyawan | Kas/Bank | Karyawan | Tanda terima | – |
| Pelunasan pinjaman | Bayar / potong gaji | Kas atau Utang Gaji | Piutang Karyawan | Karyawan | Slip | Balik |
| Uang muka operasional | Pencairan | Uang Muka Operasional | Kas | Karyawan | Tanda terima | Pertanggungjawaban: Dr Beban, Cr Uang Muka (+ sisa kembali ke Kas) |
| Gaji | Penggajian | Beban Gaji (bruto) | Utang Gaji | Karyawan | Slip | Pembayaran: Dr Utang Gaji / Cr Kas. Potongan pinjaman: Dr Utang Gaji / Cr Piutang Karyawan |
| Penarikan pemilik / gaji direktur | Pengeluaran "prive" | Prive Pemilik | Kas/Bank | Pemilik | Bukti | Balik |
| Pindah kas/bank | Transfer antar rekening | Rekening tujuan | Rekening asal | Rekening | Bukti | Balik; **bukan beban** |
| Opname / adjustment stok | Disimpan | Persediaan atau Selisih Persediaan | Sebaliknya | Produk, lokasi | Berita acara | Balik |

Contoh uji yang akan dibuktikan dengan test otomatis:

| Skenario | Hasil yang diharapkan |
|---|---|
| Penjualan tunai Rp100.000, biaya Rp60.000 | Dr Kas 100.000 / Cr Penjualan 100.000; Dr HPP 60.000 / Cr Persediaan 60.000 |
| Penjualan tempo Rp100.000, dibayar Rp40.000 | Piutang dan penjualan dicatat sekali; piutang tinggal Rp60.000 |
| Beli persediaan Rp200.000 kredit, bayar Rp50.000 | Persediaan dan utang dicatat sekali; utang tinggal Rp150.000 |
| Pemilik membayar iklan Rp100.000, lalu diganti | Beban iklan sekali, Utang kepada Pemilik naik lalu nol |
| Pinjaman staf Rp100.000 lalu dilunasi | Piutang karyawan naik lalu nol; tidak ada beban gaji |
| Penarikan pemilik Rp100.000 | Kas dan ekuitas turun; laba operasional tetap |
| Gaji dengan potongan pinjaman | Beban gaji bruto = potongan pinjaman + PPh (jika ada) + kas dibayar |

## 6. Akun yang perlu ditambah (usulan, dicocokkan dulu dengan 36 akun produksi)

Ini nama dan fungsi usulan. Kodenya akan disesuaikan dengan bagan akun produksi supaya tidak dobel:

- Uang Muka Pembelian (aset)
- Persediaan Bahan Kemasan (aset; terpisah dari barang dagang)
- Barang Titipan Pihak Lain (memo/off-balance, tidak masuk persediaan)
- Peralatan Usaha (aset tetap); Akumulasi Penyusutan setelah kebijakan diputuskan
- Utang Barang Diterima Belum Ditagih (liabilitas)
- Uang Muka & Titipan Pelanggan (liabilitas)
- Utang kepada Pemilik (liabilitas)
- Prive Pemilik (ekuitas, saldo normal debit)
- Selisih Persediaan (beban)
- Satu akun GL per rekening bank/kas, supaya rekonsiliasi per rekening bisa dilakukan

## 7. Rencana bertahap

**Fase 1: fondasi mesin (tanpa mengubah saldo produksi)**
- Versi posting dan alur koreksi (balik + posting ulang) untuk penjualan, pengeluaran, dan pembayaran.
- Pemetaan tujuan transaksi → akun dalam satu tabel konfigurasi, dipakai bersama oleh form, pratinjau, posting, perbaikan historis, dan laporan.
- Status akuntansi (Draft / Perlu informasi / Terposting / Dibalik) dan daftar pengecualian dengan tautan perbaikan.
- HPP tanpa fallback persentase; "HPP belum lengkap" muncul di daftar pengecualian.
- Identitas usaha dan status pajak di Pengaturan; laporan memakai klasifikasi akun (termasuk akun buatan sendiri dan Prive).
- Perbaikan form edit akun dan memo jurnal manual.
- Dashboard kelengkapan untuk pemilik.

**Fase 2: alur harian**
- Penjualan: DP, bayar sebagian, lebih bayar, retur.
- Pembelian: satu alur. Staf memilih barang dagang / peralatan / bahan & jasa / uang muka. Penerimaan barang, invoice, pembayaran, landed cost, dan retur diurus sistem di belakang layar.
- Pengeluaran: pilihan tujuan dalam bahasa sehari-hari tanpa kode COA, dibayar pemilik, beberapa tujuan dalam satu nota, dan pindah kas.
- Panduan singkat staf untuk tiga alur ini.

**Fase 3: perbaikan historis (dry-run dulu)**
- Script dry-run read-only di server. Script ini merekonsiliasi setiap transaksi sumber dengan semua jurnal terkait (otomatis, manual, pembalik), termasuk JRN-202611-0177 untuk invoice Ilyas.
- Hasilnya laporan sebelum/sesudah per akun dan per transaksi: sudah ditinjau vs belum, dengan total di semua halaman.
- Backup database (`pg_dump`) sebelum posting apa pun.
- Posting per baris atau per batch terpilih, dengan "tahan untuk review". Bisa dijalankan ulang tanpa dobel.
- Saldo awal dan dokumen sumber yang hilang tetap tercatat sebagai "belum diselesaikan".

Proses ini **tidak dinyatakan selesai** hanya karena neraca saldo seimbang. Kriteria selesai mengikuti bagian "Define finished" pada permintaan pemilik.

## 8. Keputusan yang dibutuhkan dari pemilik

1. Metode biaya persediaan: rata-rata bergerak (usulan) atau FIFO.
2. Dasar alokasi ongkos angkut/impor: nilai barang (usulan) atau kuantitas.
3. Peralatan: batas kapitalisasi, metode, dan umur penyusutan.
4. Kurs valas: sumber kurs, dan perlu revaluasi akhir bulan atau tidak.
5. Rezim PPh dan tanggal mulai usaha 2026.
6. Nama usaha dan pemilik yang tertulis di laporan keuangan.
7. Konfirmasi AJ/MJ/SLM/LRM = satu wajib pajak.
8. Setuju menambah akun di bagian 6 (dicocokkan dengan bagan akun produksi).
9. Setuju menonaktifkan PPN dari catatan nota (karena non-PKP).
