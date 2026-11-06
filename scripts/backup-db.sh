#!/usr/bin/env bash
# Backup database sebelum menerapkan koreksi akuntansi historis.
# Pemakaian: DATABASE_URL=postgresql://... bash scripts/backup-db.sh [folder-tujuan]
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL belum diset}"
dir="${1:-backups}"
mkdir -p "$dir"
file="$dir/slm-$(date +%Y%m%d-%H%M%S).dump"
# pg_dump tidak mengenal parameter ?schema= dari Prisma.
pg_dump --format=custom --no-owner --file "$file" "${DATABASE_URL%%\?*}"
echo "Backup tersimpan: $file"
echo "Pulihkan bila perlu: pg_restore --clean --no-owner -d \"\$DATABASE_URL\" $file"
