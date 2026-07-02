import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvFiles } from "./load-env.mjs";

loadEnvFiles();

const cwd = process.cwd();
const salesFile = path.join(cwd, "data", "sales-records.json");
const DUMMY_PREFIX = "DUMMY-DASH-";
const DUMMY_COUNT = 90;

if (process.env.NEXT_PUBLIC_APP_MODE === "production") {
  console.error("Refusing to seed dashboard dummy data when NEXT_PUBLIC_APP_MODE=production.");
  process.exit(1);
}

if (!existsSync(salesFile)) {
  console.error(`Sales data file not found: ${salesFile}`);
  process.exit(1);
}

function readSales() {
  const raw = readFileSync(salesFile, "utf8");
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new Error("data/sales-records.json must contain a JSON array.");
  return rows;
}

function jakartaDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function startOfJakartaDay(date) {
  return new Date(`${jakartaDateKey(date)}T00:00:00+07:00`);
}

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick(random, rows) {
  return rows[Math.floor(random() * rows.length)];
}

function rupiah(value) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

const products = [
  { sku: "DUMMY-BERAS", name: "Dummy Beras Premium", categoryId: 1, uomId: 1, price: 185_000 },
  { sku: "DUMMY-MINYAK", name: "Dummy Minyak Goreng", categoryId: 2, uomId: 1, price: 42_000 },
  { sku: "DUMMY-GULA", name: "Dummy Gula Pasir", categoryId: 2, uomId: 1, price: 28_500 },
  { sku: "DUMMY-KOPI", name: "Dummy Kopi Bubuk", categoryId: 3, uomId: 1, price: 58_000 },
  { sku: "DUMMY-TEPUNG", name: "Dummy Tepung Terigu", categoryId: 2, uomId: 1, price: 17_500 },
  { sku: "DUMMY-SABUN", name: "Dummy Sabun Cuci", categoryId: 4, uomId: 1, price: 31_000 }
];

const customers = [
  "Dummy Toko Melati",
  "Dummy Toko Mawar",
  "Dummy Warung Sentosa",
  "Dummy Grosir Utama",
  "Dummy Pelanggan Harian",
  "Dummy Toko Sejahtera",
  "Dummy Minimarket Sinar",
  "Dummy Toko Makmur"
];

const locations = ["Jakarta Barat", "Jakarta Selatan", "Tangerang", "Bekasi", "Depok", "Bogor"];

const paymentProfiles = [
  { method: "Cash", weight: 45, rekeningId: "cash-w", rekeningNameSnapshot: "Kas Walk In" },
  { method: "TF", weight: 25, rekeningId: "dummy-bca-w", rekeningNameSnapshot: "BCA Operasional - BCA", transferAccount: "BCA Operasional - BCA" },
  { method: "TF", weight: 20, rekeningId: "dummy-mandiri-w", rekeningNameSnapshot: "Mandiri Utama - Bank Mandiri", transferAccount: "Mandiri Utama - Bank Mandiri" },
  { method: "Tempo", weight: 10 }
];

function weightedPayment(random) {
  const roll = random() * paymentProfiles.reduce((sum, profile) => sum + profile.weight, 0);
  let cursor = 0;
  for (const profile of paymentProfiles) {
    cursor += profile.weight;
    if (roll <= cursor) return profile;
  }
  return paymentProfiles[0];
}

function makeItems(random) {
  const count = 1 + Math.floor(random() * 3);
  const used = new Set();
  const items = [];
  while (items.length < count) {
    const product = pick(random, products);
    if (used.has(product.sku)) continue;
    used.add(product.sku);
    const quantity = 1 + Math.floor(random() * 8);
    const discount = random() < 0.22 ? Math.round((product.price * quantity * 0.05) / 500) * 500 : 0;
    items.push({
      productRef: product.sku,
      productInputMode: "manual",
      manualProduct: {
        sku: product.sku,
        name: product.name,
        productCategoryId: product.categoryId,
        uomId: product.uomId,
        brandCode: "DUMMY",
        costPrice: Math.round(product.price * 0.72),
        sellingPrice: product.price,
        description: "Dummy dashboard lokal non-AJ"
      },
      unitSnapshot: "PCS",
      quantity,
      unitPrice: product.price,
      discount
    });
  }
  return items;
}

function itemTotal(items) {
  return items.reduce((sum, item) => sum + (item.quantity * item.unitPrice - (item.discount || 0)), 0);
}

function assertSafeDummy(rows) {
  for (const row of rows) {
    if (!String(row.id || "").startsWith(DUMMY_PREFIX)) throw new Error(`Unsafe dummy id: ${row.id}`);
    if (row.tipeCodeSnapshot === "AJ" || row.tipeId === "AJ") throw new Error(`Dummy ${row.id} uses forbidden AJ type.`);
    if (row.syncTarget === "erp" || row.syncStatus === "erp") throw new Error(`Dummy ${row.id} uses forbidden ERP sync.`);
    if (row.isTestTransaction !== true) throw new Error(`Dummy ${row.id} must be marked as test transaction.`);
  }
}

const existingRows = readSales();
const preservedRows = existingRows.filter((row) => !String(row.id || "").startsWith(DUMMY_PREFIX));
const today = startOfJakartaDay(new Date());
const from = new Date(today);
from.setDate(from.getDate() - 29);
const seedNumber = Number(jakartaDateKey(today).replaceAll("-", ""));
const random = makeRandom(seedNumber);
const dummyRows = [];

for (let index = 0; index < DUMMY_COUNT; index += 1) {
  const dayOffset = index % 30;
  const saleDate = new Date(from);
  saleDate.setDate(from.getDate() + dayOffset);
  const payment = weightedPayment(random);
  const items = makeItems(random);
  const total = itemTotal(items);
  const dateKey = jakartaDateKey(saleDate);
  const createdAt = new Date(`${dateKey}T${String(8 + Math.floor(random() * 10)).padStart(2, "0")}:${String(Math.floor(random() * 60)).padStart(2, "0")}:00+07:00`).toISOString();

  dummyRows.push({
    id: `${DUMMY_PREFIX}${dateKey.replaceAll("-", "")}-${String(index + 1).padStart(3, "0")}`,
    saleDate: dateKey,
    tipeId: "W",
    tipeCodeSnapshot: "W",
    tipeNameSnapshot: "Walk In",
    rekeningId: payment.rekeningId,
    rekeningNameSnapshot: payment.rekeningNameSnapshot,
    customerName: pick(random, customers),
    customerLocation: pick(random, locations),
    deliveryDate: dateKey,
    shippingMethod: random() < 0.7 ? "di Tempat" : "Kirim Langsung",
    paymentMethod: payment.method,
    dueDate: payment.method === "Tempo" ? jakartaDateKey(new Date(saleDate.getTime() + 14 * 86_400_000)) : undefined,
    transferAccount: payment.transferAccount,
    notes: "Dummy dashboard lokal non-AJ. Aman dihapus.",
    items,
    isTestTransaction: true,
    total,
    approvalStatus: "approved",
    syncTarget: "local",
    syncStatus: "local",
    createdByUserId: "dummy-dashboard",
    createdByNameSnapshot: "Dashboard Dummy Seeder",
    createdByRoleSnapshot: "OWNER",
    createdAt
  });
}

assertSafeDummy(dummyRows);

const totals = dummyRows.reduce((summary, row) => {
  if (row.paymentMethod === "Cash") summary.cash += row.total;
  if (row.paymentMethod === "TF" && row.rekeningId === "dummy-bca-w") summary.bca += row.total;
  if (row.paymentMethod === "TF" && row.rekeningId === "dummy-mandiri-w") summary.mandiri += row.total;
  if (row.paymentMethod === "Tempo") summary.tempo += 1;
  return summary;
}, { cash: 0, bca: 0, mandiri: 0, tempo: 0 });

const nextRows = [...dummyRows, ...preservedRows].sort((a, b) => new Date(b.createdAt || b.saleDate).getTime() - new Date(a.createdAt || a.saleDate).getTime());
writeFileSync(salesFile, `${JSON.stringify(nextRows, null, 2)}\n`);

console.log("Dashboard dummy sales seeded safely.");
console.log(`Created: ${dummyRows.length} transactions (${DUMMY_PREFIX}*)`);
console.log(`Range: ${jakartaDateKey(from)} to ${jakartaDateKey(today)}`);
console.log(`Cash: ${rupiah(totals.cash)}`);
console.log(`TF BCA Operasional - BCA: ${rupiah(totals.bca)}`);
console.log(`TF Mandiri Utama - Bank Mandiri: ${rupiah(totals.mandiri)}`);
console.log(`Tempo sales count: ${totals.tempo}`);
console.log("Safety: local JSON only, W / Walk In only, syncTarget=local, no ERP/API calls.");
