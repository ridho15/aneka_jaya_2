# Runbook: pindah SLM ke VPS milik sendiri

Tujuan: aplikasi, database, foto, dan jadwal otomatis pindah utuh ke VPS baru milik Anda. Developer lama tidak punya akses ke server baru, ke Cloudflare, maupun ke kode yang dipakai server.

Lama pengerjaan: persiapan 1–2 jam (bisa kapan saja), pindahan final sekitar 30–60 menit saat toko tutup.

## A. Persiapan (tidak mengganggu aplikasi yang berjalan)

### A1. Siapkan VPS baru
- Ubuntu 22.04 atau 24.04, minimal 2 vCPU, 4 GB RAM, disk 40 GB.
- Login root dengan **SSH key** (jangan password). Aktifkan 2FA di panel provider.
- Catat IP-nya.

### A2. Siapkan repo kode
- Pakai `lrmcorp/SLM-INTERNAL-NEW`. Jadikan **private** (Settings > General > Danger Zone > Change visibility).
- Settings > Collaborators: pastikan hanya orang yang Anda percaya.
- Deploy key dibuat otomatis oleh skrip di langkah B2 (read-only, hanya untuk server ini).

### A3. Siapkan Cloudflare milik Anda
1. Buat akun di cloudflare.com dengan email Anda, aktifkan 2FA.
2. **Add a site** > `playgo.id` > paket Free.
3. Cloudflare menyalin record DNS lama. **Cek satu per satu**, terutama:
   - `slm` (A record): nanti diarahkan ke IP VPS baru, proxy **oranye**.
   - `cctvslm` dan subdomain lain: biarkan seperti sekarang.
   - **MX dan TXT** (email, verifikasi Google, dll.): wajib ada, kalau tidak email berhenti.
4. **Jangan ganti nameserver dulu.** Itu dilakukan di langkah C.

### A4. Audit server lama (opsional, disarankan)
Di server lama, dari folder aplikasi:
```bash
sudo bash scripts/server/audit-access.sh
```
Hasilnya di `/root/slm-audit-*.txt`. Yang dicari: SSH key asing, crontab yang mengirim data keluar, nilai `AUTH_PROVIDER`, dan cara Nginx/Cloudflare tersambung.

## B. Pindahan final

### B1. Hentikan transaksi & export data dari server lama
1. Umumkan ke staf: berhenti input penjualan/stok selama pindahan.
2. Di server lama, dari folder aplikasi:
   ```bash
   sudo bash scripts/server/export-old.sh
   ```
   Hasilnya satu file `/root/slm-migrasi/slm-bundle-*.tar` berisi database, foto upload, `data/`, `.env.local`, config Nginx lama, dan crontab lama.
3. Salin langsung ke VPS baru (jangan lewat chat/email):
   ```bash
   scp /root/slm-migrasi/slm-bundle-*.tar root@IP-VPS-BARU:/root/
   ```

### B2. Setup VPS baru
Di VPS baru sebagai root:
```bash
curl -fsSL https://raw.githubusercontent.com/lrmcorp/SLM-INTERNAL-NEW/main/scripts/server/setup-new.sh -o setup-new.sh
```
Kalau repo sudah private, link di atas tidak bisa dibuka: salin `setup-new.sh` dengan `scp` dari komputer Anda.

```bash
bash setup-new.sh --bundle /root/slm-bundle-XXXX.tar
```
- Run pertama berhenti dan menampilkan **deploy key**. Tambahkan di GitHub: repo > Settings > Deploy keys > Add deploy key (jangan centang write access). Lalu jalankan perintah yang sama lagi.
- Skrip mengerjakan: paket server, firewall (hanya SSH/80/443), clone kode, restore database + foto + data, **secret baru** (password database, sesi login, cron), build & start, Nginx, cron, backup harian, dan verifikasi.
- Akhir skrip menampilkan hasil `verify.sh`. Semua harus `OK`.

Secret yang dibuat baru otomatis: password Postgres, `AUTH_SESSION_SECRET` (semua user login ulang sekali), `CRON_SECRET`. Akibatnya salinan `.env.local` lama yang mungkin dipegang orang lain tidak berlaku di server baru.

## C. Arahkan domain ke VPS baru

### C1. Cek dulu tanpa mengubah DNS
Di komputer Anda, tambahkan sementara ke file hosts: `IP-VPS-BARU slm.playgo.id`, lalu buka `https://slm.playgo.id` (abaikan peringatan sertifikat). Login, buka penjualan, lihat foto resi lama. Hapus baris hosts setelahnya.

### C2. Arahkan DNS
- Di Cloudflare Anda: record `slm` > IP VPS baru, proxy oranye.
- SSL/TLS > Overview: **Full** dulu (sertifikat di server masih self-signed).
- Di registrar domain: ganti nameserver ke 2 nameserver dari Cloudflare Anda. Aktif dalam beberapa menit sampai beberapa jam; Cloudflare mengirim email saat aktif.

### C3. Pasang sertifikat Cloudflare (lalu SSL jadi Full strict)
1. Cloudflare > SSL/TLS > Origin Server > Create Certificate (RSA, `slm.playgo.id`, 15 tahun).
2. Di VPS baru, simpan isi *Origin Certificate* ke `/etc/ssl/slm/origin.pem` dan *Private Key* ke `/etc/ssl/slm/origin.key`, lalu:
   ```bash
   chmod 600 /etc/ssl/slm/origin.key && nginx -t && systemctl reload nginx
   ```
3. Cloudflare > SSL/TLS > Overview: ubah ke **Full (strict)**.

## D. Setelah pindah

### D1. Cek bersama staf
- Login, input penjualan uji lalu batalkan, cetak nota, foto resi DO, laporan stok.
- Aplikasi Android: tetap jalan tanpa install ulang (domain sama).
- Laporan WhatsApp jam 20:00 masuk.

### D2. Sistem lain yang memanggil SLM
- **Server CCTV**: memanggil `https://slm.playgo.id/api/cctv/...`, otomatis ikut DNS. Kalau token CCTV di-rotate, ubah di dua sisi sekaligus (`CCTV_API_TOKEN` di `.env.local` VPS baru dan di server CCTV), lalu `docker compose up -d slm-app`.
- **MJ**: memakai `https://slm.playgo.id/api/integrations/mj/...`, ikut DNS. Token MJ ada di database; buat token baru bila perlu dengan `scripts/provision-integration-token.mjs`.
- **ERP Anika, WhatsApp, Gemini**: tidak perlu diubah, kecuali Anda ingin mengganti key ke akun Anda sendiri.

### D3. Kunci akses lama
- Server lama: matikan container (`docker compose down`) setelah 1–2 hari berjalan normal, lalu hapus servernya. **Matikan juga crontab lama** supaya laporan WhatsApp tidak terkirim dua kali.
- Aplikasi: Settings > Users > nonaktifkan akun yang bukan milik tim Anda.
- Hapus paket pindahan di kedua server: `shred -u /root/slm-bundle-*.tar /root/slm-migrasi/*.tar`.

### D4. Backup
- Otomatis tiap hari 01:30 di `/var/backups/slm` (database 14 hari, foto mingguan 4 minggu).
- Backup di server yang sama tidak melindungi bila VPS hilang. Salin rutin ke tempat lain, misalnya dari komputer Anda:
  ```bash
  rsync -av root@IP-VPS-BARU:/var/backups/slm/ ~/backup-slm/
  ```
- Uji restore sesekali: `pg_restore --list /var/backups/slm/db-*.dump | head`.

## Update aplikasi setelah ini
Di VPS baru:
```bash
cd /opt/slm && bash update.sh && bash scripts/server/verify.sh
```
Kode hanya ditarik dari repo Anda (`lrmcorp/SLM-INTERNAL-NEW`) lewat deploy key read-only.

## Kalau ada masalah saat pindahan
- **Belum ganti DNS:** server lama tetap melayani. Cukup lanjutkan transaksi di server lama dan ulangi export nanti.
- **Sudah ganti DNS, VPS baru bermasalah:** di Cloudflare, arahkan record `slm` kembali ke IP server lama. Transaksi yang sempat masuk ke VPS baru perlu dicatat dan diinput ulang.

## Portainer
Tidak diperlukan. Semua pengelolaan lewat SSH dan `docker compose`. Tanpa panel tambahan, pintu masuk ke server lebih sedikit.
