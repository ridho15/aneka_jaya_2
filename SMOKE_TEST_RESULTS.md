# Smoke Test Results

Date: 2026-06-27  
Mode: mock  
Local dev server: `http://127.0.0.1:3101` with isolated `DATA_DIR=/private/tmp/aneka_jaya_next16_smoke`  
Docker container: `http://127.0.0.1:3000`
Framework: Next.js `16.2.9`

## Business Flow

| Check | Role | Result |
| --- | --- | --- |
| Create Penjualan with payment method `Tempo` | Admin | Pass: `POST /api/sales` returned `201`, sale status `pending_approval` |
| Approve pending sale | Owner | Pass: `POST /api/approval/{id}` returned `200`, approval status `approved` |
| Create Tempo receivable after approval | Owner | Pass: `tempo-receivables.json` contained a new receivable |
| Pay Tempo partially | Finance | Pass: `POST /api/tempo/{id}/pay` returned `200`, receivable status `partial_paid` |
| Dashboard counts partial Tempo | Owner | Pass: `/dashboard` rendered `Tempo terbuka` as `Rp 200 rb` and `1 piutang belum lunas` |

## Permission Checks

| Endpoint | Role | Expected | Result |
| --- | --- | --- | --- |
| `POST /api/upload` | Owner | `201` | Pass |
| `POST /api/upload` | Admin | `201` | Pass |
| `POST /api/upload` | Finance | `201` | Pass |
| `POST /api/upload` | Manager | `403` | Pass |
| `POST /api/upload` | Viewer | `403` | Pass |
| `GET /api/products` | Owner | `200` | Pass |
| `GET /api/products` | Admin | `200` | Pass |
| `GET /api/products` | Finance | `403` | Pass |
| `GET /api/products` | Manager | `403` | Pass |
| `GET /api/products` | Viewer | `403` | Pass |

## Automated Verification

| Command | Result |
| --- | --- |
| `npm test` | Pass: 3 files, 8 tests |
| `npm run lint` | Pass: no warnings or errors |
| `npm run build` | Pass |
| `npm audit` | Pass: `0 vulnerabilities` |
| `docker compose build` | Pass: image built with `npm ci` and Next.js 16.2.9 |
| `docker compose up -d` + `GET /api/health` | Pass: container started and health returned `200` |
| `npx prisma format` | Pass |
| `npx prisma generate` | Pass: Prisma Client v6.19.3 generated |
| Postgres migration SQL via `psql` | Pass: migration created enums, tables, indexes, and FK |
| Containerized `db:migrate:deploy` | Pass: `prisma migrate deploy` applied migration from app image to Compose Postgres |
| Containerized `db:migrate:json` | Pass: ran twice with idempotent imported/skipped/failed summary |
| Containerized `db:verify` | Pass: verified `AuditLog`, `ApprovalRequest`, `TempoReceivable`, `TempoPayment`, and `SalesRecord` |

## Security Review

Next.js and `eslint-config-next` were upgraded from 14.2.35 to 16.2.9 through a targeted major upgrade. ESLint was moved to the flat config flow required by the current Next ESLint package, and `postcss` is pinned through a direct dependency plus override.

`npm audit` now reports `0 vulnerabilities`. No `npm audit fix --force` was used.

Prisma was added for production-readiness scaffolding. Prisma 7 introduced a dev dependency audit issue during implementation, so the project uses Prisma/Prisma Client `6.19.3`, which keeps `npm audit` clean.

## Notes

- Docker build context was reduced by adding `.dockerignore`; context dropped from hundreds of MB to a few KB.
- `.env.local` was added for local/mock Docker startup.
- Local smoke data was written to `/private/tmp/aneka_jaya_next16_smoke`, not the project `data/` directory.
- Next.js 16 requires async access for request APIs such as `cookies()` and `headers()`. The auth/session entry point and dependent server pages/routes were updated accordingly.
- Docker Compose now includes a PostgreSQL service. The initial Prisma migration SQL was verified directly with `psql` in the Postgres container.
- `npx prisma migrate deploy` and `npx prisma db push` from the host failed with an empty Prisma schema engine error in this local environment, despite Postgres being healthy and direct `psql` access succeeding. `npm run migrate:json` also reached Prisma Client but failed with a database access denial from the host connection. Keep this as a tooling/runtime follow-up before relying on Prisma migrations in CI.
- Follow-up fix: the production image now includes Prisma CLI, generated Prisma Client, `prisma/`, and `scripts/`; Docker Compose helper jobs run migration/import/verify inside the same image and network as Postgres. This container-first workflow passed in an isolated Compose project.
