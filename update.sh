#!/bin/bash
set -euo pipefail

# ==============================================================================
# SLM Production Update & Deployment Script
# Safe, idempotent, fail-fast deployment pipeline
# ==============================================================================

echo "========================================================"
echo "🚀 [1/6] Memulai proses update SLM Production..."
echo "========================================================"

# 1. Cek ruang disk sebelum build
AVAILABLE_KB=$(df --output=avail / | tail -n1)
AVAILABLE_MB=$(( AVAILABLE_KB / 1024 ))
echo "ℹ️ Ruang disk tersedia pada partisi root: ${AVAILABLE_MB} MB"

if [ "$AVAILABLE_MB" -lt 2048 ]; then
  echo "⚠️ Ruang disk kritis (< 2 GB)! Membersihkan build cache Docker..."
  docker builder prune -f || true
  docker image prune -f || true
fi

# 2. Tarik update terbaru dari Git
echo ""
echo "📥 [2/6] Menarik update repository (git pull)..."
git pull

# 3. Jalankan migrasi kolom database jika container postgres aktif
echo ""
echo "🗄️ [3/6] Memeriksa & sinkronisasi database PostgreSQL..."
if docker compose ps slm-postgres 2>/dev/null | grep -q "Up"; then
  echo "Menjalankan migrasi manual kolom customerPhone jika belum ada..."
  docker compose exec -T slm-postgres psql -U slm -d slm -c \
    'ALTER TABLE "SalesRecord" ADD COLUMN IF NOT EXISTS "customerPhone" TEXT;' || true
else
  echo "⚠️ Container slm-postgres belum menyala. Melanjutkan ke tahap berikutnya..."
fi

# Sekali saja: foto upload yang masih tersimpan di dalam container lama dipindah ke volume slm_uploads,
# karena container lama dihapus saat dibuat ulang.
UPLOADS_SAVE=""
if ! docker volume ls --format '{{.Name}}' | grep -q '_slm_uploads$' && docker exec slm-app test -d /app/public/uploads 2>/dev/null; then
  UPLOADS_SAVE="$(mktemp /root/slm-uploads-XXXX.tar.gz)"
  docker exec slm-app tar -C /app/public -czf - uploads > "$UPLOADS_SAVE"
  echo "Foto upload lama disimpan sementara di $UPLOADS_SAVE"
fi

# 4. Build image Docker
echo ""
echo "🔨 [4/6] Membangun image Docker (slm-app:local)..."
docker compose build slm-app

# 5. Jalankan deploy migrasi Prisma
echo ""
echo "📦 [5/6] Menerapkan migrasi database Prisma..."
docker compose run --rm db-migrate || true

# 6. Nyalakan / restart container aplikasi
echo ""
echo "🔄 [6/6] Menyalakan container aplikasi..."
docker compose up -d slm-app slm-gateway
if [ -n "$UPLOADS_SAVE" ]; then
  docker compose exec -T slm-app tar -C /app/public -xzf - < "$UPLOADS_SAVE"
  echo "Foto upload dipindah ke volume slm_uploads ($(docker compose exec -T slm-app sh -c 'find /app/public/uploads -type f | wc -l') file). Salinan: $UPLOADS_SAVE"
fi

# Pembersihan image lama (dangling) yang sudah digantikan
echo ""
echo "🧹 Membersihkan image lama yang tidak terpakai..."
docker image prune -f || true

echo ""
echo "========================================================"
echo "📊 Status Container Saat Ini:"
echo "========================================================"
docker compose ps

echo ""
echo "✅ Selesai! Aplikasi SLM Production berhasil ter-update dan berjalan normal."
