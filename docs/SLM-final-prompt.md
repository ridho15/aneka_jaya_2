# Final build prompt — SLM Finance dan SDM

Anda adalah engineer senior yang membangun fitur keuangan untuk UKM Indonesia. Kerjakan **SLM Internal App yang sudah ada** di repositori privat `lrmcorp/SLM`. Jangan membuat aplikasi baru dan jangan menyalin Balaka secara utuh. Gunakan [mockup SLM](./SLM-mockup.html) sebagai referensi alur dan tampilan, bukan sebagai sumber data atau kode produksi. Bahasa antarmuka tetap Indonesia dan gaya visual mengikuti SLM.

## Mulai dari kondisi aplikasi yang nyata

Sebelum mengubah kode, baca framework, migrasi, model Penjualan/Pengeluaran, approval, rekening, tipe W/AJ/SLM/ONLINE, ERP Sync Aneka Jaya, audit trail, hak akses, serta tes. Sampaikan peta komponen yang akan disentuh, tentukan apakah SLM atau ERP menjadi sumber kebenaran untuk stok dan jurnal, lalu rancangan migrasi singkat. Peninjauan UI menunjukkan form Pengeluaran sudah punya tanggal, tipe, rekening, COA umum, kategori, penerima, jumlah, metode, bukti, dan catatan; laporan finance menjumlahkan pengeluaran approved. Verifikasi kembali dalam kode. Jangan berasumsi semua tipe transaksi berada pada entitas hukum yang sama. Jangan mengubah data produksi atau deploy tanpa instruksi terpisah.

## Hasil utama

Pengguna tetap memasukkan **Kasbon** dan **Gaji** dengan cepat dari **Input Pengeluaran**. Pilih kategori dan karyawan. Setelah approved/posted, transaksi otomatis terlihat pada **SDM → Kasbon** atau **SDM → Gaji** milik karyawan tersebut, tanpa entri ulang. Kasbon adalah **piutang karyawan**, bukan beban. Gaji adalah pembayaran karyawan; jangan membebankan atau menjurnal dua kali. Pengeluaran biasa, pembelian persediaan, kasbon, uang muka operasional, gaji, dan simpanan karyawan perlu klasifikasi dan laporan berbeda meski ada yang memakai form kas/bank sama.

Pembukuan utama dan jurnal memakai **IDR**; transaksi dan saldo rekening USD/RMB juga menyimpan jumlah asli, kurs, tanggal dan sumber kurs. Setiap jurnal posted seimbang, terhubung ke dokumen sumber, tidak dapat diedit, idempotent, dan dapat dibalik dengan audit trail. Tampilkan status approval, posting jurnal, dan ERP Sync secara terpisah.

## A. Input Pengeluaran → SDM

Pertahankan field umum: tanggal, tipe pembukuan, rekening, nominal yang **benar-benar dibayarkan**, metode, bukti, dan catatan. Sediakan kode kategori stabil, bukan pencocokan teks bebas, untuk `Beban operasional`, `Pembelian barang`, `Kasbon pribadi`, `Uang muka operasional`, dan `Gaji`. Pertahankan kategori lama melalui migrasi yang aman.

| Pilihan | Field tambahan wajib | Hasil setelah approved/posted |
|---|---|---|
| Beban operasional | Akun beban, penerima | Beban dan pembayaran; tidak menambah saldo SDM |
| Pembelian barang | Supplier, barang atau referensi pembelian | Pembelian/utang/persediaan; bukan otomatis beban operasional |
| Kasbon pribadi | Karyawan, tujuan | Pencairan dan saldo kasbon karyawan itu |
| Uang muka operasional | Karyawan, tujuan | Saldo uang muka dan pertanggungjawaban terpisah |
| Gaji | Karyawan, periode bulan/tahun | Riwayat pembayaran gaji periode tersebut |

Jatuh tempo untuk kasbon/uang muka opsional. Saat kategori dipilih, tampilkan hanya field tambahan yang relevan. Validasi karyawan, periode gaji, rekening, jumlah positif, dan bukti menurut aturan aplikasi. Sebelum submit, tampilkan klasifikasi dan pratinjau jurnal. Untuk Gaji, namai angka `Jumlah dibayarkan`; jangan menyimpulkan gaji bruto, PPh 21, BPJS, atau potongan dari angka itu. Jika payroll sudah mencatat `Utang Gaji`, pembayaran melunasi akun itu; jika tidak, perlakukan sebagai Beban Gaji sesuai kebijakan yang telah disetujui.

Simpan **satu transaksi sumber** Pengeluaran dengan `category_code`, `employee_id` bila relevan, `salary_period` bila relevan, `approval_status`, `posting_status`, `bank_account_id`, serta referensi jurnal. SDM harus membaca relasi sumber/subledger yang dibuat atomik; jangan membuat salinan finansial yang dapat menyimpang. Pending dapat terlihat berlabel pending tetapi tidak menaikkan saldo resmi. Rejected tidak memengaruhi saldo atau jurnal. Retry ERP Sync tidak membuat pembayaran atau jurnal ganda. Koreksi setelah posting menggunakan reversal, alasan, dan referensi asal.

### Pelunasan kasbon

Pada detail karyawan sediakan `Catat Pelunasan Kasbon`: tanggal, jumlah, metode transfer/tunai/potong gaji, rekening atau referensi payroll, bukti, dan approval. Kurangi saldo orang yang dipilih saja. Tolak jumlah di atas saldo kecuali ada alur kelebihan bayar yang eksplisit. Potongan gaji memerlukan catatan persetujuan tertulis dan tidak boleh dicatat sekaligus sebagai penerimaan bank. Uang muka operasional mempunyai tindakan `Pertanggungjawaban` tersendiri: lampiran, biaya sebenarnya, pengembalian sisa, dan jurnal penutup. Jangan mencampur saldo uang muka dengan kasbon pribadi.

## B. Menu SDM sederhana

1. **Karyawan & Bagan**: nama, jabatan, departemen, atasan, aktif/nonaktif. Bagan dihasilkan dari data karyawan. Satu orang boleh merangkap peran. Transaksi lama harus tetap menunjuk orang yang benar bila profil berubah.
2. **Kasbon & Uang Muka**: daftar karyawan dengan saldo terbuka, total dicairkan, total dibayar, dan jatuh tempo. Klik seseorang untuk melihat setiap pencairan, cicilan/pelunasan, tanggal, nomor dokumen, saldo berjalan, status approval, bukti, jurnal, dan tautan ke Pengeluaran asal. Ada pencarian nama/status dan filter jenis. Jumlah saldo per orang = total daftar = akun buku besar terkait.
3. **Gaji**: riwayat pembayaran per orang dan periode; tampilkan tanggal bayar, jumlah yang dibayarkan, rekening sumber, bukti, approval, Pengeluaran asal, dan jurnal. Dua pembayaran dalam satu bulan harus tetap menjadi dua baris, dengan jumlah periode yang jelas. Jangan membangun payroll penuh jika sistem belum memilikinya.
4. **Simpanan karyawan**: kewajiban per orang, setoran atau potongan dengan otorisasi tertulis, penarikan, saldo berjalan, dan mutasi. Rekonsiliasikan total kewajiban dengan dana pada rekening yang ditetapkan. Jangan menjadikannya pendapatan, menjanjikan bunga, atau membangun fitur penghimpunan simpanan publik.

Owner/finance berwenang dapat melihat semua. Karyawan, jika ada self-service, hanya miliknya. Pengguna operasional yang boleh input Pengeluaran tidak otomatis boleh melihat semua nominal gaji. Audit akses dan perubahan sensitif menurut pola aplikasi; batasi ringkasan sensitif di dashboard umum.

## C. Pembelian, USD/RMB, dan biaya barang

Ikuti sumber kebenaran stok/ERP yang sudah ada: `pesanan pembelian → penerimaan barang → invoice supplier → landed cost → pembayaran`. PO belum menjurnal. Dukung penerimaan, invoice, dan pembayaran sebagian; uang muka supplier, retur, dan pembatalan diberi status/referensi. Jangan menambah stok dua kali jika ERP sudah menanganinya.

Setiap item menyimpan SKU, qty, harga satuan asli, mata uang `IDR|USD|RMB`, diskon, subtotal asli, kurs akuntansi IDR per unit valas, tanggal dan sumber kurs, subtotal IDR, serta biaya teralokasi. Shipment memisahkan freight, asuransi, bea masuk, handling, dan pajak impor. Tampilkan metode alokasi landed cost (misalnya proporsi nilai atau qty), hasil per SKU, dan rekonsiliasi ke total biaya yang boleh dikapitalisasi. PPN masukan atau PPh 22 impor yang dapat dikreditkan tidak otomatis masuk HPP; tentukan perlakuan berdasarkan entitas dan dokumen.

Perluas pengaturan rekening dengan mata uang, akun buku besar, saldo awal asli/tanggal, status aktif, dan assignment tipe. **Satu rekening fisik satu mata uang.** Rekening pembelian USD dan RMB terpisah; jangan menebak mata uang dari nama bank. Tampilkan saldo asli dan ekuivalen IDR dengan tanggal kurs. Pembayaran supplier valas memakai rekening dengan mata uang sama atau transaksi konversi eksplisit. Bedakan kurs pembukuan, kurs bank aktual, dan kurs pajak/kepabeanan. Catat selisih kurs pelunasan. Kebijakan penilaian saldo akhir periode mengikuti standar akuntansi entitas yang berlaku; jangan mengaktifkan revaluasi otomatis tanpa keputusan itu.

## D. Penjualan dan jurnal

Lanjutkan Penjualan yang sudah ada (Cash, TF, Tempo, Other; W/AJ/SLM/ONLINE). Pada posting yang tepat, buat jurnal kas/piutang, pendapatan, PPN keluaran bila berlaku, HPP, dan persediaan. HPP berasal dari metode valuasi stok aktual ERP/SLM, **bukan** persentase Gross Profit estimasi dashboard. Pelunasan tempo sebagian, retur, refund, dan reversal mengacu ke invoice asal serta tidak menghasilkan jurnal ganda. Pajak mengikuti status PKP, jenis barang/jasa, dan tanggal efektif; jangan hard-code satu tarif permanen.

## E. Aturan jurnal minimum

| Peristiwa | Debit | Kredit |
|---|---|---|
| Beban biasa dibayar | Beban terkait | Bank/Kas |
| Kasbon dicairkan | Piutang Karyawan | Bank/Kas |
| Kasbon dilunasi transfer/tunai | Bank/Kas | Piutang Karyawan |
| Kasbon dipotong dari gaji terutang | Utang Gaji | Piutang Karyawan |
| Uang muka operasional dicairkan | Uang Muka Karyawan | Bank/Kas |
| Uang muka dipertanggungjawabkan | Beban/Aset terkait dan Bank/Kas untuk sisa kembali | Uang Muka Karyawan |
| Gaji dibayar, belum diakui | Beban Gaji | Bank/Kas |
| Gaji dibayar, sudah diakui | Utang Gaji | Bank/Kas |
| Simpanan diterima | Bank/Kas atau Utang Gaji | Utang Simpanan Karyawan |
| Simpanan ditarik | Utang Simpanan Karyawan | Bank/Kas |
| Invoice supplier | Persediaan/Barang Dalam Perjalanan dan pajak terkait bila berlaku | Utang Usaha |
| Pembayaran supplier | Utang Usaha dan rugi kurs bila ada | Bank dan laba kurs bila ada |
| Invoice penjualan | Kas/Piutang | Penjualan dan PPN keluaran bila berlaku |
| Barang terjual | HPP | Persediaan |

Ini pola jurnal, bukan pengganti keputusan kebijakan akuntansi. Tentukan akun persis dan saat pengakuan berdasarkan stok, invoice, pajak, dan standar entitas. Semua debit/kredit jurnal utama dalam IDR, tetapi subledger utang/piutang/bank valas mempertahankan mata uang asli. `posted` tidak dapat diedit atau dihapus. Pakai nomor sumber unik, kunci `source_type + source_id + posting_type`, periode tutup, reversal, dan retry idempotent.

## F. Migrasi, laporan, dan keamanan

- Migrasi schema aman dan backward compatible. Jangan mengganti field COA/rekening lama tanpa pemetaan.
- Pengeluaran historis dengan teks seperti `Kasbon Aida` atau `Gaji` masuk **daftar review manual**; jangan otomatis mengubah laba rugi masa lalu.
- Rekonsiliasi: Pengeluaran vs jurnal; kasbon vs Piutang Karyawan; gaji vs Beban/Utang Gaji; simpanan vs liabilitas dan bank; pembelian vs stok/utang; penjualan vs piutang/HPP; rekening vs mutasi.
- Pisahkan buku dan laporan menurut tipe/entitas yang benar. Jika hubungan W/AJ/SLM/ONLINE ke entitas hukum tidak jelas, jangan gabungkan otomatis.
- Bukti memakai penyimpanan SLM yang ada. Audit pembuat, approver, poster, reverser, dan perubahan master rekening/karyawan/kurs.
- UI desktop dan ponsel; label, validasi, error, empty state, serta akses keyboard jelas.

## G. Tes penerimaan wajib

1. Pengeluaran Kasbon Rp 1.000.000 untuk Rina dari Bank IDR dibuat pending: saldo resmi Rina tidak berubah. Approved/posted: saldo naik Rp 1.000.000, bank turun, beban operasional tidak naik, satu jurnal seimbang tercipta.
2. Pelunasan Rina Rp 300.000 membuat sisa Rp 700.000. Saldo Budi tidak berubah. Saldo berjalan, total daftar, subledger, dan buku besar cocok.
3. Pengeluaran Gaji Rp 5.000.000 untuk Rina periode Oktober 2026 muncul di SDM → Gaji dengan tanggal/rekening/bukti sama. Retry ERP Sync tetap satu pembayaran dan satu jurnal. Jika Utang Gaji sudah tercatat, jangan catat Beban Gaji lagi.
4. Kasbon/gaji rejected tidak mengubah saldo resmi. Reversal membalik akun dan menyisakan riwayat yang tertaut.
5. RMB 32.000 × Rp 2.250 = Rp 72.000.000 sebelum landed cost. Freight Rp 3.200.000 + bea masuk Rp 2.100.000 menghasilkan landed cost Rp 77.300.000, atau Rp 386.500 untuk 200 unit. Utang supplier tetap sebesar invoice; biaya impor punya kredit/utang atau pembayaran tersendiri.
6. Pembayaran sebagian USD dari Bank USD menyisakan payable USD dan IDR yang benar. Bank RMB tak dapat dipilih tanpa konversi eksplisit.
7. Penjualan approved mem-posting pendapatan/HPP sekali. Retur memakai pembalik yang dapat ditelusuri.
8. Jurnal posted seimbang hingga sen IDR; periode tutup menolak perubahan; role tak berhak tak dapat melihat gaji orang lain; tes lama tetap lolos.

## Hasil kerja dan urutan

Serahkan: peta alur lama/baru, keputusan data model dan jurnal, daftar file/migrasi, preview UI, hasil tes, rencana backup/rollout/rollback, serta keputusan bisnis/akuntansi yang masih memerlukan pemilik atau akuntan. Kerjakan bertahap: **(1) Pengeluaran → SDM, (2) jurnal, (3) pembelian valas/rekening, (4) penjualan/HPP, (5) simpanan/bagan**. Setiap tahap harus menyatu dengan SLM dan dapat direview sebelum tahap berikutnya.

Inspirasi: [Balaka](https://github.com/artivisi/balaka) untuk COA, template jurnal, reversal, persediaan, dan rekonsiliasi. Balaka sendiri menyebut multi-currency belum termasuk cakupannya; rancang USD/RMB khusus bagi SLM.
