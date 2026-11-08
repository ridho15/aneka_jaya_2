#!/usr/bin/env bash
# Jalankan di SERVER LAMA. Membuat satu paket pindahan: database, foto upload, data/, .env.local, dan config Nginx.
# Tidak menghentikan atau mengubah aplikasi. Untuk pindahan final, hentikan input transaksi dulu (lihat runbook).
# Pakai (root, dari folder aplikasi):  sudo bash scripts/server/export-old.sh [folder-tujuan]
set -euo pipefail

APP_DIR="$(pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="${1:-/root/slm-migrasi}"
WORK="$DEST/slm-bundle-$STAMP"
mkdir -p "$WORK"
chmod 700 "$DEST" "$WORK"

[ -f "$APP_DIR/docker-compose.yml" ] || { echo "Jalankan dari folder aplikasi (yang berisi docker-compose.yml)."; exit 1; }
docker ps --format '{{.Names}}' | grep -q '^slm-postgres$' || { echo "Container slm-postgres tidak berjalan."; exit 1; }

echo "[1/5] Dump database (format custom, bisa di-restore utuh)..."
docker exec slm-postgres pg_dump -U slm -d slm --format=custom --no-owner > "$WORK/slm.dump"
docker exec slm-postgres psql -U slm -d slm -At -c \
  "SELECT relname || '=' || n_live_tup FROM pg_stat_user_tables ORDER BY relname;" > "$WORK/row-counts.txt"

echo "[2/5] Foto upload dari container slm-app..."
if docker exec slm-app test -d /app/public/uploads; then
  docker exec slm-app tar -C /app/public -czf - uploads > "$WORK/uploads.tar.gz"
else
  echo "  (tidak ada /app/public/uploads di container)"; tar -czf "$WORK/uploads.tar.gz" --files-from /dev/null
fi
echo "  jumlah file: $(tar -tzf "$WORK/uploads.tar.gz" | grep -vc '/$' || true)"

echo "[3/5] Volume data/ (/app/data)..."
docker exec slm-app tar -C /app -czf - data > "$WORK/data.tar.gz" 2>/dev/null || tar -czf "$WORK/data.tar.gz" --files-from /dev/null

echo "[4/5] .env.local dan config Nginx..."
cp "$APP_DIR/.env.local" "$WORK/env.local"
[ -f "$APP_DIR/.env" ] && cp "$APP_DIR/.env" "$WORK/env.compose"
if [ -d /etc/nginx ]; then tar -czf "$WORK/nginx-lama.tar.gz" -C /etc nginx; fi
crontab -l > "$WORK/crontab-root.txt" 2>/dev/null || true
git -C "$APP_DIR" log --oneline -1 > "$WORK/app-commit.txt" 2>/dev/null || true

echo "[5/5] Checksum & arsip..."
( cd "$WORK" && sha256sum ./* > SHA256SUMS )
tar -C "$DEST" -cf "$DEST/slm-bundle-$STAMP.tar" "slm-bundle-$STAMP"
chmod 600 "$DEST/slm-bundle-$STAMP.tar"
rm -rf "$WORK"

cat <<EOF

Paket pindahan: $DEST/slm-bundle-$STAMP.tar  ($(du -h "$DEST/slm-bundle-$STAMP.tar" | cut -f1))
Isinya mengandung SEMUA data dan secret. Jangan kirim lewat chat/email.
Salin langsung ke server baru, contoh:
  scp $DEST/slm-bundle-$STAMP.tar root@IP-SERVER-BARU:/root/
Lalu hapus dari server lama setelah restore terbukti berhasil.
EOF
