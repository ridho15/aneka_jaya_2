#!/usr/bin/env bash
# Jalankan di VPS BARU (Ubuntu 22.04/24.04) sebagai root. Aman diulang: langkah yang sudah selesai dilewati.
#
#   bash setup-new.sh --bundle /root/slm-bundle-XXXX.tar [--domain slm.playgo.id] [--repo git@github.com:lrmcorp/SLM-INTERNAL-NEW.git]
#
# Yang dikerjakan: paket server, firewall, clone repo (deploy key), restore database + foto + data,
# secret baru, build & start aplikasi, Nginx, cron job, backup harian, lalu verifikasi.
set -euo pipefail

DOMAIN="slm.playgo.id"
REPO="git@github.com:lrmcorp/SLM-INTERNAL-NEW.git"
BRANCH="main"
APP_DIR="/opt/slm"
BUNDLE=""
ROTATE=1
while [ $# -gt 0 ]; do
  case "$1" in
    --bundle) BUNDLE="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --dir) APP_DIR="$2"; shift 2 ;;
    --keep-secrets) ROTATE=0; shift ;;
    *) echo "Argumen tidak dikenal: $1"; exit 1 ;;
  esac
done

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root."; exit 1; }
step() { printf '\n==> %s\n' "$1"; }
rand() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "${1:-48}"; }
set_env() { # set_env FILE KEY VALUE  (ganti baris yang ada, atau tambahkan)
  local f="$1" k="$2" v="$3"
  if grep -q "^$k=" "$f"; then sed -i "s|^$k=.*|$k=$v|" "$f"; else printf '%s=%s\n' "$k" "$v" >> "$f"; fi
}
get_env() { grep -E "^$2=" "$1" | tail -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }

step "1. Paket server, zona waktu, firewall"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git openssl nginx ufw fail2ban unattended-upgrades postgresql-client >/dev/null
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh >/dev/null; fi
docker compose version >/dev/null
timedatectl set-timezone Asia/Jakarta || true
if ufw allow OpenSSH >/dev/null && ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && ufw --force enable >/dev/null; then :; else
  echo "PERINGATAN: firewall (ufw) gagal diaktifkan. Aktifkan manual: ufw allow OpenSSH; ufw allow 80,443/tcp; ufw enable"
fi
systemctl enable --now fail2ban >/dev/null 2>&1 || true
echo "Firewall: hanya SSH, 80, 443. Postgres & app tidak terbuka ke internet."

step "2. Ambil kode aplikasi"
if [ ! -d "$APP_DIR/.git" ]; then
  KEY=/root/.ssh/slm_deploy
  if [ ! -f "$KEY" ]; then
    mkdir -p /root/.ssh && ssh-keygen -t ed25519 -N '' -C "slm-deploy@$(hostname)" -f "$KEY" >/dev/null
  fi
  ssh-keyscan -t ed25519 github.com >> /root/.ssh/known_hosts 2>/dev/null
  if ! git -c core.sshCommand="ssh -i $KEY -o IdentitiesOnly=yes" clone -q --branch "$BRANCH" "$REPO" "$APP_DIR" 2>/dev/null; then
    echo
    echo "Belum bisa clone $REPO. Tambahkan deploy key ini (Read-only) di GitHub:"
    echo "  Repo > Settings > Deploy keys > Add deploy key"
    echo
    cat "$KEY.pub"
    echo
    echo "Lalu jalankan ulang perintah yang sama."
    exit 2
  fi
fi
cd "$APP_DIR"
git config core.sshCommand "ssh -i /root/.ssh/slm_deploy -o IdentitiesOnly=yes"
git pull -q --ff-only || true
echo "Kode: $(git log --oneline -1)"

step "3. Buka paket data dari server lama"
WORK="$APP_DIR/.migrasi"
if [ -n "$BUNDLE" ]; then
  [ -f "$BUNDLE" ] || { echo "Paket $BUNDLE tidak ada."; exit 1; }
  rm -rf "$WORK" && mkdir -p "$WORK" && chmod 700 "$WORK"
  tar -C "$WORK" -xf "$BUNDLE"
  WORK="$(find "$WORK" -maxdepth 1 -type d -name 'slm-bundle-*' | head -1)"
  ( cd "$WORK" && sha256sum -c --quiet SHA256SUMS ) || { echo "Checksum paket tidak cocok. Salin ulang."; exit 1; }
  echo "Paket dari commit lama: $(cat "$WORK/app-commit.txt" 2>/dev/null)"
  [ -f "$APP_DIR/.env.local" ] || install -m 600 "$WORK/env.local" "$APP_DIR/.env.local"
elif [ ! -f "$APP_DIR/.env.local" ]; then
  echo "Tidak ada --bundle dan belum ada .env.local. Jalankan dengan --bundle."; exit 1
fi
chmod 600 "$APP_DIR/.env.local"

step "4. Secret baru (server lama tidak bisa dipakai untuk masuk ke server ini)"
touch "$APP_DIR/.env" && chmod 600 "$APP_DIR/.env"
FRESH_DB=0
if ! docker volume ls --format '{{.Name}}' | grep -q '_slm_postgres$'; then FRESH_DB=1; fi
if [ "$FRESH_DB" -eq 1 ] && [ -z "$(get_env "$APP_DIR/.env" POSTGRES_PASSWORD)" ]; then
  set_env "$APP_DIR/.env" POSTGRES_PASSWORD "$(rand 40)"
  echo "Password Postgres baru dibuat (disimpan di $APP_DIR/.env)."
fi
if [ "$ROTATE" -eq 1 ] && [ ! -f "$APP_DIR/.secrets-rotated" ]; then
  set_env "$APP_DIR/.env.local" AUTH_SESSION_SECRET "$(rand 64)"
  set_env "$APP_DIR/.env.local" CRON_SECRET "$(rand 48)"
  if [ -n "$(get_env "$APP_DIR/.env.local" AUTH_GATEWAY_SESSION_SECRET)" ]; then set_env "$APP_DIR/.env.local" AUTH_GATEWAY_SESSION_SECRET "$(rand 64)"; fi
  if [ -n "$(get_env "$APP_DIR/.env.local" AUTH_TRUSTED_HEADER_SECRET)" ]; then set_env "$APP_DIR/.env.local" AUTH_TRUSTED_HEADER_SECRET "$(rand 64)"; fi
  date -Is > "$APP_DIR/.secrets-rotated"
  echo "AUTH_SESSION_SECRET dan CRON_SECRET baru. Semua user perlu login ulang sekali."
fi
for k in AUTH_SESSION_SECRET CRON_SECRET; do [ -n "$(get_env "$APP_DIR/.env.local" "$k")" ] || { echo "$k kosong di .env.local"; exit 1; }; done

step "5. Build image & database"
docker compose build -q slm-app
docker compose up -d slm-postgres
for i in $(seq 1 30); do docker compose exec -T slm-postgres pg_isready -U slm -d slm >/dev/null 2>&1 && break; sleep 2; done
TABLES=$(docker compose exec -T slm-postgres psql -U slm -d slm -At -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';")
if [ -n "$BUNDLE" ] && [ "$TABLES" -eq 0 ]; then
  echo "Restore database dari paket..."
  docker compose exec -T slm-postgres pg_restore -U slm -d slm --no-owner --role=slm --exit-on-error < "$WORK/slm.dump"
  echo "Bandingkan jumlah baris (lama vs baru):"
  docker compose exec -T slm-postgres psql -U slm -d slm -At -c "ANALYZE;" >/dev/null
  docker compose exec -T slm-postgres psql -U slm -d slm -At -c \
    "SELECT relname || '=' || n_live_tup FROM pg_stat_user_tables ORDER BY relname;" > "$WORK/row-counts-new.txt"
  diff <(grep -E '^(User|SalesRecord|SalesRecordItem|ExpenseRecord|TempoReceivable|InventoryProduct|InventoryMovement|JournalEntry|DeliveryOrder)=' "$WORK/row-counts.txt") \
       <(grep -E '^(User|SalesRecord|SalesRecordItem|ExpenseRecord|TempoReceivable|InventoryProduct|InventoryMovement|JournalEntry|DeliveryOrder)=' "$WORK/row-counts-new.txt") \
    && echo "  Jumlah baris tabel utama sama." || echo "  PERHATIAN: ada selisih jumlah baris, cek di atas (statistik bisa sedikit beda; hitung ulang dengan count(*) bila ragu)."
elif [ "$TABLES" -gt 0 ]; then
  echo "Database sudah berisi $TABLES tabel; restore dilewati."
fi
docker compose run --rm db-migrate

step "6. Jalankan aplikasi, lalu salin foto & data/"
docker compose up -d slm-app
if [ -n "$BUNDLE" ] && [ ! -f "$APP_DIR/.uploads-restored" ]; then
  docker compose exec -T slm-app tar -C /app/public -xzf - < "$WORK/uploads.tar.gz"
  docker compose exec -T slm-app tar -C /app -xzf - < "$WORK/data.tar.gz" || true
  date -Is > "$APP_DIR/.uploads-restored"
  echo "Foto upload: $(docker compose exec -T slm-app sh -c 'find /app/public/uploads -type f | wc -l') file."
fi
if [ "$(get_env "$APP_DIR/.env.local" AUTH_PROVIDER)" = "trusted_header" ]; then
  docker compose up -d slm-gateway
  echo "AUTH_PROVIDER=trusted_header: gateway 8086 ikut dijalankan. Arahkan Nginx ke 127.0.0.1:8086 (lihat runbook)."
fi
for i in $(seq 1 60); do curl -fsS -o /dev/null http://127.0.0.1:3000/login && break; sleep 2; done
curl -fsS -o /dev/null http://127.0.0.1:3000/login && echo "Aplikasi menjawab di 127.0.0.1:3000."

step "7. Nginx"
mkdir -p /etc/ssl/slm && chmod 700 /etc/ssl/slm
if [ ! -f /etc/ssl/slm/origin.pem ]; then
  openssl req -x509 -nodes -newkey rsa:2048 -days 30 -subj "/CN=$DOMAIN" \
    -keyout /etc/ssl/slm/origin.key -out /etc/ssl/slm/origin.pem >/dev/null 2>&1
  echo "Sertifikat sementara (self-signed, 30 hari) dipasang. Ganti dengan Cloudflare Origin Certificate (runbook langkah C3)."
fi
chmod 600 /etc/ssl/slm/origin.key
sed "s/__DOMAIN__/$DOMAIN/g" "$APP_DIR/deploy/nginx/slm.conf.template" > /etc/nginx/sites-available/slm.conf
ln -sf /etc/nginx/sites-available/slm.conf /etc/nginx/sites-enabled/slm.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null || nginx

step "8. Cron job & backup harian"
install -m 700 "$APP_DIR/scripts/server/slm-job.sh" /usr/local/bin/slm-job
install -m 700 "$APP_DIR/scripts/server/slm-backup.sh" /usr/local/bin/slm-backup
cat > /etc/cron.d/slm <<EOF
# Dipasang oleh scripts/server/setup-new.sh (waktu server: Asia/Jakarta)
SLM_APP_DIR=$APP_DIR
0 6 * * *   root /usr/local/bin/slm-job check-stock-alert
0 7 * * *   root /usr/local/bin/slm-job retry-erp-sync
0 9 * * *   root /usr/local/bin/slm-job send-tempo-reminder
0 20 * * *  root /usr/local/bin/slm-job send-daily-report
30 2 * * *  root /usr/local/bin/slm-job cleanup-cctv-storage
30 1 * * *  root /usr/local/bin/slm-backup
EOF
chmod 644 /etc/cron.d/slm
if [ -n "$BUNDLE" ] && [ -s "$WORK/crontab-root.txt" ]; then
  echo "Crontab di server lama (bandingkan jadwalnya dengan /etc/cron.d/slm):"; sed 's/^/  /' "$WORK/crontab-root.txt"
fi

step "9. Verifikasi"
bash "$APP_DIR/scripts/server/verify.sh" "$APP_DIR" "$DOMAIN" || true

cat <<EOF

Selesai. Sisa langkah manual ada di docs/runbook-pindah-vps.md:
  - pasang Cloudflare Origin Certificate di /etc/ssl/slm/ (origin.pem, origin.key) lalu: systemctl reload nginx
  - arahkan DNS $DOMAIN ke IP server ini di akun Cloudflare Anda
  - hapus paket $BUNDLE setelah semua dicek: shred -u $BUNDLE
EOF
