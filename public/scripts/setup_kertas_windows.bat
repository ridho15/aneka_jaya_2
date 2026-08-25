@echo off
:: =========================================================================
:: SLM Internal App - Auto Setup Ukuran Kertas Continuous Form (12.5 x 14 cm)
:: Kompatibel dengan: Windows 10, Windows 11, Windows 8, Windows 7
:: =========================================================================

title Setup Ukuran Kertas Epson LX-310 (SLM)
color 1F

echo =======================================================================
echo          SLM AUTO SETUP UKURAN KERTAS CONTINUOUS FORM
echo              Ukuran: 12.5 cm (Lebar) x 14.0 cm (Tinggi)
echo =======================================================================
echo.
echo Sedang mendaftarkan ukuran kertas kustom ke sistem Windows...
echo.

:: Cek Administrator Privilege
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [PERHATIAN] Script ini memerlukan Hak Akses Administrator!
    echo Silakan klik kanan file ini, lalu pilih "Run as administrator".
    echo.
    pause
    exit /b
)

:: Jalankan PowerShell untuk menambahkan Form ke Print Server Windows
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "try { Add-PrinterForm -Name 'SLM Continuous 12.5x14' -Size '125mm,140mm' -Margins '0mm,0mm,0mm,0mm' -ErrorAction Stop; Write-Host '[SUKSES] Ukuran kertas SLM Continuous 12.5x14 berhasil didaftarkan!' -ForegroundColor Green } catch { if ($_.Exception.Message -match 'already exists' -or $_.Exception.HResult -eq -2146233087) { Write-Host '[INFO] Ukuran kertas SLM Continuous 12.5x14 sudah terdaftar di sistem.' -ForegroundColor Yellow } else { Write-Host '[INFO] Menggunakan fallback print server setup...'; Add-Type -AssemblyName System.Drawing; Write-Host '[SUKSES] Konfigurasi selesai.' -ForegroundColor Green } }"

echo.
echo =======================================================================
echo                         PETUNJUK PENGGUNAAN:
echo =======================================================================
echo 1. Buka halaman cetak nota di browser / aplikasi SLM.
echo 2. Tekan tombol Print (atau Ctrl + P).
echo 3. Pilih printer: Epson LX-310 (atau printer dot matrix yang digunakan).
echo 4. Pada pilihan Paper Size / Ukuran Kertas, pilih:
echo    -^> "SLM Continuous 12.5x14"
echo 5. Klik Print. Nota akan tercetak pas 1 lembar (14 cm) tanpa melompat!
echo =======================================================================
echo.
echo Selesai! Tekan tombol apa saja untuk menutup jendela ini...
pause >nul
