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

# 4. Build image Docker
echo ""
echo "🔨 [4/6] Membangun image Docker (slm-app:local)..."
# Hapus cache buildkit lama sebelum build untuk menjamin ruang disk aman
docker builder prune -f || true
docker compose build slm-app

# 5. Jalankan deploy migrasi Prisma
echo ""
echo "📦 [5/6] Menerapkan migrasi database Prisma..."
docker compose run --rm db-migrate || true

# 6. Nyalakan / restart container aplikasi
echo ""
echo "🔄 [6/6] Menyalakan container aplikasi..."
docker compose up -d slm-app slm-gateway

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
