#!/usr/bin/env bash
# Cek cepat setelah setup atau update. Pakai: bash scripts/server/verify.sh [folder-aplikasi] [domain]
set -u
APP_DIR="${1:-/opt/slm}"; DOMAIN="${2:-slm.playgo.id}"
ok() { echo "  OK    $1"; }; bad() { echo "  GAGAL $1"; FAIL=1; }
FAIL=0
cd "$APP_DIR" || exit 1
echo "Verifikasi SLM ($DOMAIN)"
for c in slm-postgres slm-app; do
  [ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)" = "true" ] && ok "container $c berjalan" || bad "container $c tidak berjalan"
done
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login); [ "$code" = "200" ] && ok "app /login 200" || bad "app /login -> $code"
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/downloads/slm-android.apk); [ "$code" = "200" ] && ok "APK Android tersaji" || bad "APK -> $code"
code=$(curl -sk -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/login"); [ "$code" = "200" ] && ok "Nginx https://$DOMAIN/login 200 (lokal)" || bad "Nginx -> $code"
code=$(curl -sk -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/jobs/send-daily-report"); [ "$code" = "404" ] && ok "cron job tertutup dari luar" || bad "/api/jobs dari luar -> $code"
n=$(docker compose exec -T slm-postgres psql -U slm -d slm -At -c 'SELECT count(*) FROM "User" WHERE "isActive"' 2>/dev/null); [ -n "$n" ] && ok "database: $n user aktif" || bad "database tidak bisa dibaca"
n=$(docker compose exec -T slm-app sh -c 'find /app/public/uploads -type f | wc -l' 2>/dev/null); ok "foto upload: ${n:-0} file (volume slm_uploads)"
exposed=$(ss -tln | awk 'NR>1 {print $4}' | grep -E ':(5432|3000)$' | grep -vE '^(127\.0\.0\.1|\[::1\]):' || true)
[ -z "$exposed" ] && ok "port 3000/5432 hanya lokal" || bad "terbuka ke luar: $exposed"
nginx -t >/dev/null 2>&1 && ok "nginx -t" || bad "nginx -t"
openssl x509 -in /etc/ssl/slm/origin.pem -noout -issuer 2>/dev/null | grep -qi cloudflare && ok "sertifikat origin dari Cloudflare" || echo "  INFO  sertifikat masih self-signed (ganti dengan Cloudflare Origin Certificate)"
[ -f /etc/cron.d/slm ] && ok "cron /etc/cron.d/slm terpasang" || bad "cron belum terpasang"
ls /var/backups/slm/db-*.dump >/dev/null 2>&1 && ok "ada backup database" || echo "  INFO  belum ada backup (jalan otomatis 01:30, atau: slm-backup)"
[ "$FAIL" -eq 0 ] && echo "Semua cek lolos." || { echo "Ada cek yang gagal."; exit 1; }
