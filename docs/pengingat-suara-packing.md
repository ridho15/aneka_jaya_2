# Pengingat suara packing

Nota yang **1,5 jam** setelah waktu transaksi belum punya label QR tercatat CCTV diumumkan lewat speaker kamera packing:

> "Perhatian tim packing. Ada 2 nota belum diproses. Toko Hansel, Toko Sinar. Segera diproses. Terima kasih."

- Tiap jam pukul **08:00–15:00 WIB**, Senin–Sabtu. Tidak ada suara pada hari Minggu, hari libur, atau setelah 15:00.
- Semua penjualan yang disetujui diperiksa (kecuali transaksi uji). Nota kemarin yang belum dikemas diumumkan pagi berikutnya.
- Paling banyak tiga nama customer disebut; sisanya "dan N lainnya".
- Setiap pengumuman dicatat di **Laporan → CCTV → 4. Pengumuman Suara** dan dikirim ke penerima WhatsApp yang mencentang **Terima pengingat packing**.

Suara dibuat dan diputar oleh layanan `speaker` di server CCTV (repo `lrmcorp/SLM`, `docs/pengumuman-suara.md`).

## Pemasangan

1. Jalankan migrasi database: `npm run db:migrate:deploy` (menambah tabel `CctvVoiceAnnouncement` dan kolom `receivesPackingReminder`).
2. Isi `.env` aplikasi:

   ```
   CCTV_SPEAKER_URL=https://<domain-server-cctv>/api/speaker
   CCTV_SPEAKER_TOKEN=<sama dengan SPEAKER_TOKEN di server CCTV>
   ```

3. Jadwalkan tugas tiap jam, Senin–Sabtu, di server aplikasi (crontab), dengan `CRON_SECRET` yang sama seperti tugas lain:

   ```
   0 8-15 * * 1-6 curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" http://127.0.0.1:3000/api/jobs/packing-voice-reminder
   ```

   Hari libur dan jam tetap diperiksa oleh aplikasi, jadi jadwal ini aman dijalankan lebih sering.

4. Buka **Laporan → CCTV → 4. Pengumuman Suara**: tambahkan hari libur bergerak (Idulfitri, Iduladha, Nyepi, Waisak, cuti bersama), lalu nyalakan **Aktif** dengan **Mode uji** tetap tercentang.

## Uji lalu nyalakan

1. **Dengarkan di sini**: suara diputar di browser, tidak di toko.
2. Satu hari dengan **Mode uji**: semua tercatat dan WhatsApp terkirim, speaker diam.
3. **Uji di speaker kamera** dengan Mode uji dimatikan, pada waktu yang disepakati.
4. Setelah pemilik setuju, biarkan Mode uji mati.

Label yang gagal terbaca kamera membuat nota itu tetap diumumkan; riwayat menyebut nota mana saja sehingga bisa diperiksa.
