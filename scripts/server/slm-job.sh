#!/usr/bin/env bash
# Panggil satu cron job SLM lewat localhost dengan CRON_SECRET dari .env.local. Contoh: slm-job send-daily-report
set -euo pipefail
JOB="${1:?nama job, mis. send-daily-report}"
APP_DIR="${SLM_APP_DIR:-/opt/slm}"
SECRET="$(grep -E '^CRON_SECRET=' "$APP_DIR/.env.local" | tail -1 | cut -d= -f2- | sed 's/^"//; s/"$//')"
curl -fsS -m 300 -X POST -H "x-cron-secret: $SECRET" "http://127.0.0.1:3000/api/jobs/$JOB" \
  | logger -t "slm-job[$JOB]"
