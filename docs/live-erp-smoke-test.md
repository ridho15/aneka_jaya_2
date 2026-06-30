# Live ERP Smoke Test — Input Penjualan AJ

Dokumen ini untuk verifikasi manual integrasi ERP nyata. Jangan jadikan langkah ini bagian dari test otomatis default karena bisa membuat transaksi di Aneka Jaya ERP.

## Prasyarat

- Login sebagai Owner/Super Admin.
- `ANIKA_ERP_API_BASE_URL` aktif.
- Sesi/token ERP tersedia.
- Tipe transaksi `AJ` dan rekening `cash-aj` tersedia.
- Gunakan produk nyata yang memang ada di ERP.

## Langkah aman

1. Buka `/penjualan/input`.
2. Pilih tipe `AJ`.
3. Pastikan teks tujuan menampilkan Aneka Jaya ERP.
4. Centang `Transaksi pengujian`.
5. Isi customer dengan nama yang mudah dicari, misalnya `TEST SLM AJ`.
6. Pilih/isi kode produk ERP nyata.
7. Isi qty dan harga kecil untuk pengujian.
8. Klik `Simpan Penjualan`.
9. Catat `Referensi pengujian` dan `Referensi ERP` jika tersedia.
10. Jika sukses, cari referensi tersebut di Aneka Jaya ERP.
11. Jika gagal, buka `/erp-sync` dan pastikan transaksi muncul sebagai retryable.

## Kriteria lulus

- Transaksi `AJ` tidak tersimpan sebagai transaksi lokal biasa.
- Jika ERP menerima, status transaksi menjadi `synced`.
- Jika ERP gagal, transaksi tetap tersimpan dengan status `failed` dan bisa diretry.
- Tidak ada token, cookie, atau payload teknis ERP yang tampil di browser.
