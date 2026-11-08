#!/usr/bin/env bash
# Backup harian: database (14 hari) dan foto upload (mingguan, 4 minggu) ke /var/backups/slm.
# Salin folder ini ke luar server secara berkala (lihat runbook); backup di server yang sama tidak melindungi dari server hilang.
set -euo pipefail
APP_DIR="${SLM_APP_DIR:-/opt/slm}"
DIR=/var/backups/slm
mkdir -p "$DIR" && chmod 700 "$DIR"
cd "$APP_DIR"
STAMP="$(date +%Y%m%d-%H%M)"
docker compose exec -T slm-postgres pg_dump -U slm -d slm --format=custom --no-owner > "$DIR/db-$STAMP.dump.part"
mv "$DIR/db-$STAMP.dump.part" "$DIR/db-$STAMP.dump"
if [ "$(date +%u)" = "7" ]; then
  docker compose exec -T slm-app tar -C /app/public -czf - uploads > "$DIR/uploads-$STAMP.tar.gz"
fi
find "$DIR" -name 'db-*.dump' -mtime +14 -delete
find "$DIR" -name 'uploads-*.tar.gz' -mtime +28 -delete
logger -t slm-backup "backup selesai: $DIR/db-$STAMP.dump"
