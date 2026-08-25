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

PAPER_NAME="SLM Continuous 12.5x14"
WIDTH_PT=354.33
HEIGHT_PT=396.85

echo "1. Mendaftarkan ukuran kertas kustom ke sistem macOS..."

# Daftarkan langsung ke preferensi sistem macOS (com.apple.print.custompapers)
python3 - <<EOF
import plistlib, os

plist_path = os.path.expanduser('~/Library/Preferences/com.apple.print.custompapers.plist')
data = {'CustomPaperDockList': [], 'CustomPapers': []}

if os.path.exists(plist_path):
    try:
        with open(plist_path, 'rb') as f:
            data = plistlib.load(f)
    except Exception:
        data = {'CustomPaperDockList': [], 'CustomPapers': []}

if 'CustomPapers' not in data:
    data['CustomPapers'] = []
if 'CustomPaperDockList' not in data:
    data['CustomPaperDockList'] = []

# Cek apakah sudah ada ukuran dengan nama yang sama
exists = False
for paper in data['CustomPapers']:
    if paper.get('name') == '$PAPER_NAME':
        paper['width'] = $WIDTH_PT
        paper['height'] = $HEIGHT_PT
        paper['top'] = 0.0
        paper['bottom'] = 0.0
        paper['left'] = 0.0
        paper['right'] = 0.0
        exists = True
        break

if not exists:
    data['CustomPapers'].append({
        'name': '$PAPER_NAME',
        'width': $WIDTH_PT,
        'height': $HEIGHT_PT,
        'top': 0.0,
        'bottom': 0.0,
        'left': 0.0,
        'right': 0.0
    })

if '$PAPER_NAME' not in data['CustomPaperDockList']:
    data['CustomPaperDockList'].append('$PAPER_NAME')

with open(plist_path, 'wb') as f:
    plistlib.dump(data, f)

print("   [OK] Ukuran kertas '$PAPER_NAME' berhasil didaftarkan ke macOS!")
EOF

echo ""
echo "2. Mengonfigurasi antrian printer CUPS..."
PRINTERS=$(lpstat -p 2>/dev/null | awk '{print $2}')

if [ -z "$PRINTERS" ]; then
    echo "   [INFO] Belum ada printer fisik terhubung di CUPS."
else
    for PRINTER in $PRINTERS; do
        echo "   -> Mengonfigurasi printer: $PRINTER ..."
        lpadmin -p "$PRINTER" -o "PageSize=Custom.354x397" 2>/dev/null || true
        lpadmin -p "$PRINTER" -o "media=Custom.354x397" 2>/dev/null || true
    done
fi

echo ""
echo "======================================================================="
echo "                         SETUP SELESAI!"
echo "======================================================================="
echo "Petunjuk Cetak di Google Chrome / Safari:"
echo "1. Buka kembali halaman cetak di browser (refresh halaman atau tekan Cmd+P)."
echo "2. Di pilihan Paper Size (Ukuran Kertas), pilih:"
echo "   -> \"$PAPER_NAME\" (atau 12.5 x 14 cm)"
echo "3. Margins: Pilih 'None'"
echo "4. Scale: Pilih '100%'"
echo "5. Hilangkan centang 'Headers and footers'"
echo "======================================================================="
echo ""
read -p "Tekan [Enter] untuk menutup jendela ini..."
