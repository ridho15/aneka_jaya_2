#!/usr/bin/env bash
# Audit akses server SLM. HANYA MEMBACA: tidak mengubah, menghapus, atau me-restart apa pun.
# Nilai secret tidak pernah dicetak; dari .env.local hanya nama variabel dan kekuatannya.
# Pakai (sebagai root, dari folder aplikasi):  sudo bash scripts/server/audit-access.sh [folder-aplikasi]
set -u

APP_DIR="${1:-$(pwd)}"
OUT="/root/slm-audit-$(date +%Y%m%d-%H%M%S).txt"
exec > >(tee "$OUT") 2>&1

section() { printf '\n==================== %s ====================\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

[ "$(id -u)" -eq 0 ] || echo "PERINGATAN: jalankan sebagai root agar semua bagian terbaca."
echo "Audit SLM  host=$(hostname)  waktu=$(date -Is)  app=$APP_DIR"

section "1. User Linux yang bisa login"
awk -F: '$7 !~ /(nologin|false|sync|halt|shutdown)$/ {print $1" uid="$3" home="$6" shell="$7}' /etc/passwd
echo "--- Anggota grup sudo/wheel/admin/docker (docker = setara root):"
for g in sudo wheel admin docker; do getent group "$g" | awk -F: -v g="$g" '{print g": "$4}'; done
echo "--- Aturan sudoers tambahan:"
grep -rhv '^\s*#' /etc/sudoers.d/ 2>/dev/null | grep -v '^\s*$' || echo "(tidak ada)"

section "2. SSH key yang diizinkan login (fingerprint + komentar)"
for home in /root /home/*; do
  f="$home/.ssh/authorized_keys"
  [ -f "$f" ] || continue
  echo "--- $f"
  while IFS= read -r line; do
    case "$line" in ''|\#*) continue ;; esac
    fp=$(printf '%s\n' "$line" | ssh-keygen -lf - 2>/dev/null || echo "(tidak terbaca)")
    echo "  $fp"
  done < "$f"
done
echo "--- Setting sshd penting:"
if have sshd; then sshd -T 2>/dev/null | grep -Ei '^(permitrootlogin|passwordauthentication|pubkeyauthentication|port|authorizedkeysfile) ' ; fi

section "3. Login terakhir & percobaan login gagal"
have last && last -n 20 -a 2>/dev/null | head -25
echo "--- IP yang login berhasil via SSH (journal 30 hari):"
journalctl -u ssh -u sshd --since "30 days ago" 2>/dev/null | grep -Eo 'Accepted [a-z]+ for [^ ]+ from [0-9a-f.:]+' | sort | uniq -c | sort -rn | head -20

section "4. Cron & timer (cari kiriman data ke luar)"
for u in $(cut -d: -f1 /etc/passwd); do
  c=$(crontab -l -u "$u" 2>/dev/null | grep -v '^\s*#' | grep -v '^\s*$')
  [ -n "$c" ] && { echo "--- crontab $u:"; echo "$c"; }
done
for f in /etc/crontab /etc/cron.d/*; do [ -f "$f" ] && { echo "--- $f:"; grep -v '^\s*#' "$f" | grep -v '^\s*$'; }; done
ls /etc/cron.daily /etc/cron.hourly 2>/dev/null
echo "--- systemd timer aktif:"
systemctl list-timers --all --no-pager 2>/dev/null | head -25
echo "--- Alat kirim file yang terpasang (rclone/s3/scp tujuan):"
for t in rclone aws s3cmd restic borg; do have "$t" && echo "TERPASANG: $t"; done
[ -f /root/.config/rclone/rclone.conf ] && { echo "rclone remotes:"; grep '^\[' /root/.config/rclone/rclone.conf; }

section "5. Port yang terbuka ke luar"
if have ss; then ss -tulpn 2>/dev/null | awk 'NR==1 || $5 !~ /^(127\.|\[::1\])/'; fi
echo "--- Firewall:"
(have ufw && ufw status verbose) 2>/dev/null || (have firewall-cmd && firewall-cmd --list-all) 2>/dev/null || echo "(ufw/firewalld tidak ada)"

section "6. Docker"
if have docker; then
  docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
  echo "--- Volume:"; docker volume ls
  echo "--- Isi /app/public di container slm-app (cek uploads & APK):"
  docker exec slm-app sh -c 'ls -la /app/public 2>&1; du -sh /app/public/uploads 2>/dev/null' 2>&1 | head -20
  echo "--- Mount slm-app:"
  docker inspect slm-app --format '{{range .Mounts}}{{.Destination}} <- {{.Name}}{{.Source}}{{"\n"}}{{end}}' 2>/dev/null
else
  echo "docker tidak ditemukan"
fi
have portainer && echo "Portainer terpasang"

section "7. Repo aplikasi & sumber update"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" remote -v | sed -E 's#://[^@/]+@#://<kredensial>@#'
  echo "branch: $(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)  commit: $(git -C "$APP_DIR" log --oneline -1)"
  echo "--- Kredensial git tersimpan (hanya lokasi):"
  for f in /root/.git-credentials /home/*/.git-credentials; do [ -f "$f" ] && echo "ADA: $f ($(wc -l < "$f") baris)"; done
  git -C "$APP_DIR" config --get credential.helper && true
  ls /root/.ssh/*.pub 2>/dev/null
else
  echo "Folder $APP_DIR bukan repo git. Berikan path aplikasi sebagai argumen."
fi

section "8. Nama variabel .env.local & kekuatan secret (nilai TIDAK dicetak)"
ENVF="$APP_DIR/.env.local"
if [ -f "$ENVF" ]; then
  while IFS= read -r line; do
    case "$line" in ''|\#*) continue ;; esac
    key="${line%%=*}"; val="${line#*=}"; val="${val%\"}"; val="${val#\"}"
    note=""
    case "$key" in
      *SECRET*|*TOKEN*|*PASSWORD*|*_KEY|*API_KEY*)
        if [ -z "$val" ]; then note="KOSONG"
        elif [ "${#val}" -lt 24 ]; then note="LEMAH (panjang ${#val})"
        else note="ok (panjang ${#val})"; fi
        case "$val" in change-me|changeme|secret|password) note="PLACEHOLDER — ganti";; esac ;;
      AUTH_PROVIDER|NEXT_PUBLIC_APP_MODE|INVENTORY_SOURCE|WHATSAPP_PROVIDER|MJ_INTEGRATION_ENVIRONMENT|CCTV_BASE_URL|CCTV_PUBLIC_URL|ANIKA_ERP_API_BASE_URL)
        note="= $val";;
      *) note="(bukan secret)";;
    esac
    printf '  %-40s %s\n' "$key" "$note"
  done < "$ENVF"
else
  echo "Tidak ada $ENVF"
fi
grep -q 'POSTGRES_PASSWORD: slm' "$APP_DIR/docker-compose.yml" 2>/dev/null && echo "PERINGATAN: password Postgres masih default di docker-compose.yml"

section "9. Nginx & sertifikat"
if have nginx; then
  nginx -t 2>&1 | tail -2
  ls -la /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null
  echo "--- server_name, proxy_pass, sertifikat:"
  grep -rhoE '^\s*(server_name|proxy_pass|ssl_certificate|ssl_certificate_key|ssl_client_certificate)\s+[^;]+' /etc/nginx/ 2>/dev/null | sed 's/^\s*//' | sort -u
  for c in $(grep -rhoE 'ssl_certificate\s+[^;]+' /etc/nginx/ 2>/dev/null | awk '{print $2}' | sort -u); do
    [ -f "$c" ] && echo "--- $c: $(openssl x509 -in "$c" -noout -issuer -enddate 2>/dev/null | tr '\n' ' ')"
  done
else
  echo "nginx tidak ditemukan"
fi

section "10. Cloudflare Tunnel"
if have cloudflared || systemctl list-unit-files 2>/dev/null | grep -q cloudflared; then
  systemctl status cloudflared --no-pager 2>/dev/null | head -5
  ls /etc/cloudflared ~/.cloudflared 2>/dev/null
  echo "Ada tunnel: tunnel ini milik akun Cloudflare yang membuatnya. Buat ulang di akun Anda saat pindah."
else
  echo "cloudflared tidak terpasang (traffic kemungkinan lewat Nginx + proxy Cloudflare)"
fi

section "11. Akun aplikasi & token integrasi (dari database)"
if have docker && docker ps --format '{{.Names}}' | grep -q '^slm-postgres$'; then
  docker exec slm-postgres psql -U slm -d slm -P pager=off -c \
    'SELECT "externalId", email, role, "isActive", "lastLoginAt" FROM "User" ORDER BY role, "lastLoginAt" DESC NULLS LAST;' 2>&1
  docker exec slm-postgres psql -U slm -d slm -P pager=off -c \
    'SELECT c.code AS klien, t.prefix, t.environment, t."isActive", t."lastUsedAt", t."revokedAt" FROM "IntegrationToken" t JOIN "IntegrationClient" c ON c.id = t."clientId" ORDER BY t."createdAt";' 2>&1
else
  echo "Container slm-postgres tidak berjalan; lewati."
fi

section "Selesai"
echo "Hasil tersimpan di $OUT (hanya bisa dibaca root)."
chmod 600 "$OUT"
