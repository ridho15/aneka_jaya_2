# Production-Like Verification Runbook

Gunakan runbook ini sebelum deploy production atau saat uji staging yang meniru production.

## 1. Environment Wajib

Isi environment berikut dan jangan commit nilai secret:

- `NEXT_PUBLIC_APP_MODE=production`
- `AUTH_PROVIDER=local_credentials`
- `AUTH_SESSION_SECRET`
- `DATABASE_URL`
- `INITIAL_OWNER_EXTERNAL_ID`
- `INITIAL_OWNER_PASSWORD` atau `INITIAL_OWNER_PASSWORD_HASH`
- `CRON_SECRET`

Validasi otomatis:

```bash
npm run deploy:check-env
```

Aturan keamanan:

- `CRON_SECRET` tidak boleh `change-me`.
- Secret/token/password/API key tidak boleh memakai prefix `NEXT_PUBLIC_`.
- `AUTH_ALLOW_DEMO_IN_PRODUCTION` tidak boleh `true`.

## 2. Database Production-Like

Dengan Docker Compose lokal:

```bash
docker compose up -d postgres
docker compose --profile tools run --rm db-migrate
docker compose --profile tools run --rm db-seed-owner
docker compose --profile tools run --rm db-import
docker compose --profile tools run --rm db-verify
```

Di environment non-Compose:

```bash
npm run db:migrate:deploy
npm run db:seed-owner
npm run db:verify
```

Acceptance:

- Tabel `User` tersedia.
- Ada minimal satu Owner aktif dari `INITIAL_OWNER_EXTERNAL_ID`.
- `db:verify` sukses.

## 3. Reverse Proxy / SSO

Reverse proxy/SSO tidak menjadi syarat jalur utama. Login production-like memakai form internal di `/login`; pastikan HTTPS aktif di layer platform/reverse proxy dan akses langsung ke app mengikuti kebijakan deployment.

## 4. Smoke Test Auth

Jalankan smoke test otomatis setelah app production-like berjalan. Untuk verifikasi lokal, gunakan `http://localhost:3000` sebagai `APP_BASE_URL`:

```bash
APP_BASE_URL=http://localhost:3000 \
SMOKE_LOGIN_IDENTIFIER=... \
SMOKE_LOGIN_PASSWORD=... \
npm run deploy:smoke-auth
```

Skenario yang dicek:

- Tanpa session -> diarahkan ke `/login`.
- `/login` menampilkan form email/username dan password.
- Credential smoke berhasil membuat session cookie.
- User login dapat membuka `/settings/users` sesuai role database.

## 5. Security Acceptance

Sebelum go-live:

- Database persistent dan backup aktif.
- `/app/data` persistent selama JSON store masih dipakai.
- Cron endpoint hanya dipanggil dengan `CRON_SECRET`.
- Health/API docs tetap dibatasi sesuai role.
- Token ERP, WhatsApp, OpenCloud, dan session secret hanya server-side.

## 6. Next Phase

Setelah login internal production-like stabil, lanjut migrasi JSON store ke Prisma:

1. Master data `BookkeepingType` dan `RekeningAccount`.
2. Audit trail full Prisma.
3. Sales, expenses, approval, dan tempo repository layer.

Setiap modul perlu adapter, test regresi, dan rencana rollback.
