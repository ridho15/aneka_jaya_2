# Aplikasi Android SLM

APK ini membuka web SLM (`https://slm.playgo.id`) di dalam aplikasi, jadi semua fitur dan hak akses sama dengan versi web dan otomatis ikut setiap update server. Tidak perlu build ulang APK ketika web berubah.

Yang ditangani khusus di Android:
- Tombol **Cetak** (`window.print()`) → dialog print Android (printer Wi-Fi / PDF).
- **Cetak thermal** (link `rawbt:`) → aplikasi RawBT. Bila RawBT belum terpasang, Play Store dibuka.
- **Foto bukti DO / upload gambar** → kamera atau galeri; kamera langsung meminta izin kamera.
- **Unduhan** (Excel, gambar, file dari tombol unduh) → folder Download.
- Link WhatsApp, telepon, dan situs lain → dibuka di aplikasinya masing-masing.
- Login tetap tersimpan; tombol Kembali HP = kembali ke halaman sebelumnya.

## Pasang di HP
1. Buka `https://slm.playgo.id/downloads/slm-android.apk` di HP Android (atau tombol "Unduh aplikasi Android SLM" di halaman login).
2. Izinkan "Pasang dari sumber ini" bila diminta, lalu pasang.
3. Untuk cetak thermal, pasang juga aplikasi **RawBT** dari Play Store.

## Build ulang
Butuh JDK 17+ dan Android SDK (platform 35, build-tools 35).

1. Taruh kunci tanda tangan di `android/keystore/` (`slm-release.jks` dan `keystore.properties`). Kunci **tidak** disimpan di repo; minta salinannya ke pemilik.
2. Build:

```bash
cd android
./gradlew assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../public/downloads/slm-android.apk
```

Alamat web lain: `./gradlew assembleRelease -PslmUrl=https://alamat-lain`.
Naikkan `versionCode`/`versionName` di `app/build.gradle` setiap rilis baru.

Kunci yang sama wajib dipakai untuk setiap rilis agar APK baru bisa dipasang sebagai update. Bila kunci hilang, aplikasi lama harus dihapus dulu sebelum memasang APK baru. Tanpa folder `keystore/`, build memakai kunci debug (hanya untuk uji).
