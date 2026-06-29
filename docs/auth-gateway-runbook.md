# Auth Gateway Sementara

Status: **opsional/legacy**. Jalur operasional utama sekarang adalah login internal `AUTH_PROVIDER=local_credentials` di `/login`. Gunakan dokumen ini hanya jika suatu saat mode `trusted_header` diaktifkan kembali untuk reverse proxy/SSO.

Dokumen ini menjelaskan cara memakai login sementara yang aman sebelum SSO perusahaan tersedia. Gateway meminta username/password, membuat session cookie httpOnly, lalu meneruskan request ke aplikasi dengan trusted header. Role tetap diambil dari tabel `User` aplikasi.

## 1. Environment

Set environment aplikasi:

```env
AUTH_PROVIDER=trusted_header
AUTH_TRUSTED_HEADER_SECRET=<secret-kuat-yang-sama-dengan-gateway>
AUTH_SSO_LOGIN_URL=http://127.0.0.1:3001/login
AUTH_ENABLE_DEMO_ROLE_SELECTOR=false
```

Set environment gateway:

```env
AUTH_GATEWAY_PORT=3001
AUTH_GATEWAY_APP_ORIGIN=http://127.0.0.1:3000
AUTH_GATEWAY_SESSION_SECRET=<secret-kuat-untuk-cookie-session>
AUTH_GATEWAY_USERS=<json-array-user-gateway>
```

`AUTH_GATEWAY_USERS` harus berupa JSON satu baris. Jangan simpan password plaintext.

## 2. Buat Hash Password

Jalankan:

```bash
npm run auth:hash-password -- "password-kuat-user"
```

Output akan berbentuk:

```txt
scrypt$16384$8$1$...
```

## 3. Buat User Gateway

Contoh `AUTH_GATEWAY_USERS`:

```env
AUTH_GATEWAY_USERS=[{"username":"owner","externalId":"owner-local","name":"Owner","passwordHash":"scrypt$16384$8$1$..."}]
```

`externalId` harus sama dengan user di tabel `User`.

## 4. Seed Super Admin Pertama

Isi:

```env
INITIAL_OWNER_EXTERNAL_ID=owner-local
INITIAL_OWNER_NAME=Owner
INITIAL_OWNER_EMAIL=owner@example.local
```

Lalu jalankan:

```bash
npm run db:seed-owner
```

## 5. Jalankan Aplikasi

Terminal pertama:

```bash
npm run dev
```

Terminal kedua:

```bash
npm run auth:gateway
```

Buka:

```txt
http://127.0.0.1:3001/login
```

Setelah login berhasil, gateway meneruskan user ke aplikasi dengan header:

```http
x-aneka-auth-secret: <AUTH_TRUSTED_HEADER_SECRET>
x-aneka-user-id: <externalId>
x-aneka-user-name: <name>
```

## 6. Checklist

- User tanpa session gateway diarahkan ke `/login`.
- User gateway valid bisa masuk.
- User gateway yang `externalId`-nya belum ada di tabel `User` tidak mendapat akses panel.
- User nonaktif tidak mendapat akses panel.
- Role selector demo tidak muncul.
- Role dan permission tetap mengikuti tabel `User`.
