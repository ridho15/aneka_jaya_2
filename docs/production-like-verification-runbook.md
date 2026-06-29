# Production-Like Verification Runbook

Gunakan runbook ini sebelum deploy production atau saat uji staging yang meniru production.

## 1. Environment Wajib

Isi environment berikut dan jangan commit nilai secret:

- `NEXT_PUBLIC_APP_MODE=production`
- `AUTH_PROVIDER=trusted_header`
- `AUTH_TRUSTED_HEADER_SECRET`
- `AUTH_SSO_LOGIN_URL`
- `DATABASE_URL`
- `INITIAL_OWNER_EXTERNAL_ID`
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

Proxy atau SSO upstream wajib:

- Menghapus header client palsu sebelum forward.
- Inject `x-aneka-auth-secret` sesuai `AUTH_TRUSTED_HEADER_SECRET`.
- Inject `x-aneka-user-id` yang stabil.
- Opsional inject `x-aneka-user-name`.
- Menutup akses publik langsung ke app tanpa proxy.

## 4. Smoke Test Auth

Jalankan smoke test otomatis setelah app production-like berjalan. Untuk verifikasi lokal, gunakan `http://localhost:3000` sebagai `APP_BASE_URL`:

```bash
APP_BASE_URL=http://localhost:3000 \
AUTH_TRUSTED_HEADER_SECRET=... \
AUTH_SSO_LOGIN_URL=https://sso.example.com/login \
INITIAL_OWNER_EXTERNAL_ID=... \
npm run deploy:smoke-auth
```

Jika ada user nonaktif yang disiapkan untuk test, tambahkan:

```bash
SMOKE_DISABLED_EXTERNAL_ID=...
```

Skenario yang dicek:

- Tanpa trusted header -> diarahkan ke `/login`.
- Secret salah -> diarahkan ke `/login`.
- Tombol SSO di `/login` memakai `AUTH_SSO_LOGIN_URL`.
- User SSO belum ada di Prisma -> Viewer/no access.
- Owner seeded dapat membuka `/settings/users`.
- Role header palsu tidak mengubah akses; role database tetap menang.
- User nonaktif tidak bisa akses.

## 5. Security Acceptance

Sebelum go-live:

- Database persistent dan backup aktif.
- `/app/data` persistent selama JSON store masih dipakai.
- Cron endpoint hanya dipanggil dengan `CRON_SECRET`.
- Health/API docs tetap dibatasi sesuai role.
- Token ERP, WhatsApp, OpenCloud, dan secret SSO hanya server-side.

## 6. Next Phase

Setelah auth/SSO production-like stabil, lanjut migrasi JSON store ke Prisma:

1. Master data `BookkeepingType` dan `RekeningAccount`.
2. Audit trail full Prisma.
3. Sales, expenses, approval, dan tempo repository layer.

Setiap modul perlu adapter, test regresi, dan rencana rollback.
