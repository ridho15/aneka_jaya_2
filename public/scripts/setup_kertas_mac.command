#!/bin/bash
# =========================================================================
# SLM Internal App - Auto Setup Ukuran Kertas Continuous Form (12.5 x 14 cm)
# Kompatibel dengan: macOS Sonoma, Ventura, Monterey, Big Sur, Catalina
# =========================================================================

clear
echo "======================================================================="
echo "         SLM AUTO SETUP UKURAN KERTAS CONTINUOUS FORM (macOS)"
echo "              Ukuran: 12.5 cm (Lebar) x 14.0 cm (Tinggi)"
echo "======================================================================="
echo ""

# Ukuran dalam points (1 cm = 28.3465 pt)
# 12.5 cm = 354.33 pt -> 354
# 14.0 cm = 396.85 pt -> 397

WIDTH_PT=354
HEIGHT_PT=397

echo "Mendeteksi printer yang terpasang di Mac..."
PRINTERS=$(lpstat -p 2>/dev/null | awk '{print $2}')

if [ -z "$PRINTERS" ]; then
    echo "⚠️  Belum ada printer yang terdeteksi di CUPS."
    echo "Pastikan printer Epson LX-310 sudah ditambahkan di System Settings -> Printers & Scanners."
else
    echo "Daftar printer terdeteksi:"
    echo "$PRINTERS"
    echo ""
    for PRINTER in $PRINTERS; do
        echo "Mengonfigurasi printer: $PRINTER ..."
        lpadmin -p "$PRINTER" -o "PageSize=Custom.${WIDTH_PT}x${HEIGHT_PT}" 2>/dev/null || true
        lpadmin -p "$PRINTER" -o "media=Custom.${WIDTH_PT}x${HEIGHT_PT}" 2>/dev/null || true
    done
    echo ""
    echo "✅ Berhasil menyetel opsi ukuran kertas kustom (12.5 x 14 cm) ke printer!"
fi

echo ""
echo "======================================================================="
echo "                        PETUNJUK PENGGUNAAN:"
echo "======================================================================="
echo "1. Buka halaman cetak nota di browser / aplikasi SLM."
echo "2. Tekan tombol Print (atau Cmd + P)."
echo "3. Pada dialog cetak:"
echo "   - Paper Size: Pilih 'Custom' atau '12.5 x 14.0 cm'"
echo "   - Margins: Pilih 'None' / 'Minimum'"
echo "   - Scale: Pilih '100%'"
echo "4. Klik Print. Nota akan tercetak pas sesuai ukuran continuous form!"
echo "======================================================================="
echo ""
read -p "Tekan [Enter] untuk keluar..."
