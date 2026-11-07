#!/bin/bash
set -euo pipefail

# Build di Mac, kirim image ke server. Server tidak menjalankan next build.
# Pakai: SLM_SSH=root@1.2.3.4 SLM_DIR=/opt/slm ./scripts/deploy-from-mac.sh
: "${SLM_SSH:?isi dengan login SSH server}"
: "${SLM_DIR:?isi dengan folder SLM di server}"

docker buildx build --platform linux/amd64 -t slm-app:local --load .
docker save slm-app:local | gzip | ssh "$SLM_SSH" 'gunzip | docker load'

# git pull membawa docker-compose.yml dan folder prisma/ terbaru; migrasi berhenti di sini jika gagal
ssh "$SLM_SSH" "cd '$SLM_DIR' && git pull && docker compose run --rm db-migrate && docker compose up -d slm-app slm-gateway && docker image prune -f"
