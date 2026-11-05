# Inventory Gudang & Toko (SLM)

Modul stok native SLM. Semua stok — gudang maupun toko — tersimpan di database SLM
(`slm.playgo.id`) sebagai satu kesatuan, tidak lagi bergantung pada stok Anika ERP
(`ankjy.playgo.id`).

## Konsep

| Konsep | Keterangan |
| --- | --- |
| **Lokasi** | Gudang (`WAREHOUSE`) atau Toko (`STORE`). Satu lokasi bisa ditandai *default* untuk penjualan & penerimaan pembelian. |
| **Saldo stok** | Qty per barang per lokasi + HPP rata-rata bergerak (moving average). |
| **Mutasi / kartu stok** | Setiap perubahan stok dicatat (saldo sebelum → sesudah, referensi dokumen, user). Saldo tidak pernah diubah tanpa mutasi. |
| **Transfer** | Pindah stok antar gudang/toko. Langsung diterima, atau `IN_TRANSIT` sampai dikonfirmasi diterima / dibatalkan. |
| **Barang masuk** | Dari GRN pembelian (Pembelian → Penerimaan) atau input manual tanpa PO. |
| **Stock opname** | Hitung fisik → stok sistem **diganti** dengan qty fisik; selisih dicatat. |
| **Stock adjustment** | **Menambah (+) atau mengurangi (−)** stok yang ada, wajib alasan. |
| **Penjualan** | Bila `INVENTORY_SOURCE=local`, potong stok penjualan & pembatalannya terjadi di SLM. |

Jaminan data:
- Setiap posting berjalan dalam satu transaksi database dengan row-lock pada saldo,
  sehingga input bersamaan (mis. 2 kasir menjual barang yang sama) tidak membuat stok minus.
- Stok tidak boleh minus kecuali lokasi diset *Izinkan stok minus* (opname & pembatalan selalu boleh).
- `idempotencyKey` pada dokumen membuat request ulang (retry jaringan/API) tidak terposting dua kali.

## Koli (isi per koli)

Setiap barang bisa diberi **Isi per Koli** di Master Barang, dalam satuan barangnya
(mis. kuku palsu 60 *Lusin* per koli, hairnet 40 *Box* per koli).

- Stok tetap disimpan dalam satuan barang (lusin/pack/box), jadi penjualan per lusin/pack tidak berubah.
- Di gudang, stok ditampilkan sebagai koli + lepas, mis. 698 lusin isi 60 → **11 koli + 38 Lusin**.
- Setiap input stok (transfer, barang masuk, opname, adjustment) punya kolom **Koli × Isi 1 koli + Lepas**.
  Isi 1 koli otomatis terisi dari master barang; bila belum ada atau berubah, cukup diisi di form dan
  angkanya **disimpan ke master barang** untuk input berikutnya.
- API: kirim `koli` dan/atau `loose` (plus `unitsPerKoli` opsional = isi 1 koli, ikut disimpan ke master) sebagai ganti `quantity`/`countedQty`. Response saldo memuat
  `unitsPerKoli`, `koli`, `loose`, dan `koliText`.
- Import Excel ikut menyimpan kolom *Isi / Koli* ke master barang.

## Harga RMB & kurs

Semua harga — modal, harga jual, dan harga RMB — dicatat **per satuan barang**, yaitu per lusin
(atau per pack/box untuk barang bersatuan itu). Tidak ada harga per pcs. Satuan default barang
baru (termasuk kode tanpa kolom Satuan di Excel) adalah **Lusin**.

- Master Barang punya **Harga RMB per lusin/satuan** dan **Biaya tambahan per lusin/satuan (Rp)** (ongkir/CBM, bea).
- Modal = Harga RMB × Kurs RMB + biaya tambahan.
- Kurs RMB diatur sekali di halaman Master Barang (`PUT /api/inventory/settings/rmb-rate`).
  Saat kurs diganti, **hanya harga modal** barang yang punya harga RMB yang dihitung ulang.
  Harga jual dan nilai stok yang sudah tercatat di kartu stok tidak berubah.
- Barang tanpa harga RMB memakai modal yang diisi manual.
- Import Excel membaca kolom berjudul "Harga RMB" bila ada.

## Halaman (menu "Inventory Gudang & Toko")

- `/inventory` — matriks stok: tiap barang dengan kolom per gudang & toko, total gudang, total toko.
- `/inventory/mutasi` — mutasi & kartu stok (filter barang, lokasi, jenis, tanggal, referensi).
- `/inventory/transfer` — transfer antar gudang/toko, terima / batalkan transfer dalam perjalanan.
- `/inventory/barang-masuk` — GRN pembelian yang belum masuk stok + barang masuk manual.
- `/inventory/import` — **Import Opname dari Excel** (template "Stock Opname Aneka Jaya").
- `/inventory/opname`, `/inventory/adjustment`, `/inventory/produk`, `/inventory/lokasi`.

### Import opname dari Excel

1. Buat lokasi gudang & toko di `/inventory/lokasi` (mis. `GDG-PLUIT` Gudang, `TK-MEKAR` Toko).
2. Buka `/inventory/import`, unggah file `.xlsx`, pilih lokasi untuk kolom *Qty Gudang* dan *Qty Toko*.
3. Klik **Preview**: cek jumlah baris, barang baru, total qty per lokasi, nilai modal, dan peringatan.
4. Klik **Posting Opname**.

Aturan pembacaan (sheet `Opname`, kolom dicari berdasarkan judul header):
- Qty = `Koli × Isi/Koli + Lepas` (sama dengan rumus template). Koli tanpa Isi/Koli dihitung 0 dan diberi peringatan.
- Kolom Harga Jual yang tidak berjudul diambil dari kolom tepat setelah "Modal Lama di Sistem".
- Barang yang belum ada dibuat otomatis (satuan default `Lusin` bila kolom Satuan kosong). Bila "Perbarui master" dicentang,
  modal/harga jual 0 atau kosong **tidak** menimpa data yang sudah ada.
- "Opname penuh" (default): kode dengan qty 0 di file ikut dijadikan 0 di lokasi tersebut.
  Matikan bila file hanya berisi sebagian barang.
- Opname diposting per 250 barang. Upload ulang file yang **sama persis** tidak membuat opname ganda.
- HPP rata-rata saldo hasil opname memakai modal di master barang, sehingga nilai persediaan langsung terhitung.

Hak akses per menu:

| Menu | Permission | Super Admin | Manager / Supervisor | Admin | Petugas DO (packing) |
| --- | --- | :-: | :-: | :-: | :-: |
| Stok Gudang & Toko | `inventory.stock.view` | ✓ | ✓ | ✓ | ✓ |
| Mutasi / Kartu Stok | `inventory.movement.view` | ✓ | ✓ | | ✓ |
| Transfer Antar Gudang | `inventory.transfer` | ✓ | ✓ | ✓ | |
| Barang Masuk | `inventory.receive` | ✓ | ✓ | | |
| Stock Opname | `inventory.opname` | ✓ | ✓ | ✓ | |
| Stock Adjustment | `inventory.adjust` | ✓ | ✓ | | |
| Import Opname Excel | `inventory.import` | ✓ | | | |
| Master Barang (+ kurs RMB) | `inventory.master` | ✓ | | | |
| Gudang & Toko | `inventory.location` | ✓ | | | |

Finance dan Viewer tidak melihat menu inventory. Permission yang sama dipakai API `/api/inventory/*`.

## API

Semua endpoint ada di `/api/inventory/*` dan terdokumentasi di `GET /api/docs`
(OpenAPI: `docs/openapi.yaml`, tag *Inventory*). Endpoint bisa dipanggil dengan:

1. sesi login SLM (cookie), atau
2. **Bearer token integrasi** untuk aplikasi lain (toko, POS, marketplace):

```bash
npm run integration:token:provision -- --client=pos-toko --environment=production --name="POS Toko"
```

```bash
curl -H "Authorization: Bearer slm_production_xxx" https://slm.playgo.id/api/inventory/stocks?locationType=STORE
```

Referensi barang di body boleh `productId` (ID SLM), `sku`, atau `erpProductId`.
`locationId` boleh ID atau kode lokasi (mis. `GD-UTAMA`).

| Method | Path | Fungsi |
| --- | --- | --- |
| GET/POST | `/api/inventory/locations` | daftar / tambah gudang & toko |
| PATCH | `/api/inventory/locations/{id}` | ubah lokasi |
| GET/POST | `/api/inventory/products` | master barang (+ stok awal) |
| GET/PATCH | `/api/inventory/products/{id\|sku}` | detail barang + stok per lokasi |
| GET | `/api/inventory/stocks` | saldo per barang per lokasi (`lowStockOnly`, `locationType`, …) |
| GET | `/api/inventory/stocks/matrix` | matriks barang × lokasi |
| GET | `/api/inventory/movements` | mutasi / kartu stok |
| GET/POST | `/api/inventory/transfers` | transfer antar lokasi |
| POST | `/api/inventory/transfers/{id}/receive` | terima transfer |
| POST | `/api/inventory/transfers/{id}/cancel` | batalkan transfer |
| GET/POST | `/api/inventory/opnames` | stock opname (ganti stok) |
| GET/POST | `/api/inventory/adjustments` | stock adjustment (+/−) |
| POST | `/api/inventory/stock-in` | barang masuk manual |
| POST | `/api/inventory/purchase-receipts/{id}/post` | masukkan GRN pembelian ke stok |
| POST | `/api/inventory/import-erp` | impor awal dari ERP (Super Admin) |
| POST | `/api/inventory/import-opname` | import opname dari Excel (multipart, default preview) |
| GET/PUT | `/api/inventory/settings/rmb-rate` | kurs RMB; PUT menghitung ulang harga modal |

Contoh transfer gudang → toko:

```json
POST /api/inventory/transfers
{
  "fromLocationId": "GD-UTAMA",
  "toLocationId": "TK-PUSAT",
  "receiveNow": true,
  "idempotencyKey": "pos-trf-000123",
  "items": [{ "sku": "BRG-001", "quantity": 8 }]
}
```

Error memakai format `{ success: false, message, code, details }` dengan `code`:
`VALIDATION` (400), `NOT_FOUND` (404), `INSUFFICIENT_STOCK` (409, `details.available`),
`INVALID_STATE` (409), `DUPLICATE` (409), `AUTH_INVALID` (401), `FORBIDDEN` (403), `RATE_LIMITED` (429).

## Langkah cutover dari ERP ke SLM

1. Deploy & migrasi database: `npm run db:migrate:deploy` (migrasi `20261105010000_add_native_inventory`).
   Selama `INVENTORY_SOURCE=erp` (default), alur penjualan lama tidak berubah.
2. Login sebagai Super Admin, cek data impor (dry run, tidak menulis apa pun):
   `POST /api/inventory/import-erp` dengan body `{}`.
3. Impor sungguhan: `POST /api/inventory/import-erp` body `{"dryRun": false}`.
   Gudang ERP dibuat sebagai lokasi (dipetakan via `erpWarehouseId`), barang dibuat dengan
   `erpProductId`, dan saldo SLM di-SET sama dengan qty ERP. Aman diulang tepat sebelum cutover.
4. Di `/inventory/lokasi`: rapikan kode/nama, set jenis Gudang/Toko, tambahkan toko yang belum ada,
   dan tandai satu lokasi **default**.
5. Ubah env `INVENTORY_SOURCE=local` lalu restart. Mulai saat itu:
   - halaman Stok Barang, `/api/stocks`, alert minimum stok membaca stok SLM;
   - penjualan memotong stok SLM (ID barang/gudang ERP pada item penjualan otomatis dipetakan);
   - pembatalan/revisi penjualan mengembalikan stok SLM;
   - penerimaan pembelian (GRN) otomatis masuk ke gudang yang dipilih / default.
6. Rollback: set kembali `INVENTORY_SOURCE=erp`. Data inventory SLM tetap tersimpan.

Catatan: invoice penjualan & akuntansi yang masih dikirim ke ERP tidak diubah oleh modul ini —
yang dipindahkan ke SLM adalah **stok**.

## Test end-to-end (e2e)

Repo memakai framework [`e2e`](https://e2e.tester.army) untuk test end-to-end di browser.
Langkah `agent.*` memakai **Claude Sonnet** (`@ai-sdk/anthropic`) dan butuh `ANTHROPIC_API_KEY`;
test tanpa langkah agen jalan tanpa model.

```bash
NEXT_PUBLIC_APP_MODE=mock AUTH_PROVIDER=demo INVENTORY_SOURCE=local npm run dev
APP_URL=http://localhost:3000 npm run test:e2e
```

Test ada di `tests/*.e2e.ts` (mis. `tests/inventory.e2e.ts`: menu per role, Stok Gudang & Toko,
Tempo Admin, form opname). Opsional `E2E_CDP_ENDPOINT` untuk memakai Chromium yang sudah berjalan,
`E2E_MODEL` untuk mengganti model.
