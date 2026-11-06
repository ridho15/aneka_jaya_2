/**
 * Hitung barang dari packing list supplier (Excel pengiriman). Modul murni: dipakai pratinjau
 * di browser dan proses simpan di server supaya angkanya selalu sama.
 *
 * Aturan pemilik:
 * - Qty/ctn & harga di file per pcs. Isi pcs per satuan: dari Master Barang bila cocok, kalau tidak
 *   12 (lusin), kalau tidak habis dibagi 12 maka 10 (pack). Satuan DZ di file sudah per lusin.
 * - Stok = total pcs ÷ isi pcs per satuan. Kolom Total Qty diabaikan.
 * - Harga RMB per satuan = harga per pcs × isi pcs per satuan.
 * - CBM per satuan = CBM karton ÷ jumlah satuan di karton. Baris tanpa CTNS ikut karton baris di atasnya;
 *   CBM karton campur dibagi ke barangnya sesuai porsi pcs.
 */

export type ShipmentLine = {
  rowNumber: number;
  sku: string;
  nameOriginal: string;
  categoryOriginal: string;
  /** Jumlah karton; null = ikut karton baris sebelumnya (karton campur). */
  cartons: number | null;
  qtyPerCarton: number;
  unitInFile: string;
  unitPrice: number | null;
  cbmPerCarton: number | null;
};

export type MasterHint = { sku: string; name: string; unit: string; unitsPerKoli: number | null; pcsPerUnit: number | null; hasRealName: boolean; sellingPrice?: number };

export type ShipmentOverride = { pcsPerUnit?: number; name?: string };

export type ShipmentProduct = {
  sku: string;
  rows: number[];
  name: string;
  nameOriginal: string;
  category: string;
  exists: boolean;
  unit: string;
  pcsPerUnit: number;
  pcsPerUnitSource: "master" | "file-dz" | "rumus-12" | "rumus-10" | "manual" | "tebakan";
  totalPcs: number;
  quantity: number;
  cartons: number;
  unitsPerKoli: number | null;
  priceRmb: number | null;
  cbmPerUnit: number | null;
  warnings: string[];
};

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** Terjemahan kategori bahasa Inggris di packing list. */
const CATEGORY_ID: Array<[RegExp, string]> = [
  [/fake nail packaging box/i, "Kotak Kemasan Kuku Palsu"],
  [/fake nail packaging/i, "Kemasan Kuku Palsu"],
  [/fake nail tool/i, "Alat Kuku Palsu"],
  [/fake nail|press on nail/i, "Kuku Palsu"],
  [/false eyelash|eyelash/i, "Bulu Mata Palsu"],
  [/hair buckle/i, "Jepit Rambut"],
  [/hair claw/i, "Jepit Cakar"],
  [/hair clip/i, "Jepit Rambut"],
  [/hair band|headband/i, "Bando"],
  [/hair tie|scrunchie/i, "Ikat Rambut"],
  [/key ?ring|keychain/i, "Gantungan Kunci"],
  [/4d art sticker/i, "Stiker Kuku 4D"],
  [/3d art sticker/i, "Stiker Kuku 3D"],
  [/nail sticker/i, "Stiker Kuku"],
  [/acne patch/i, "Plester Jerawat"]
];

export function categoryToIndonesian(english: string) {
  const hit = CATEGORY_ID.find(([re]) => re.test(english));
  return hit ? hit[1] : english.trim();
}

/** Kategori dari kolom kategori; bila kolom itu kosong atau hanya angka, dari nama barang. */
function categoryFor(categoryOriginal: string, nameOriginal: string) {
  if (/[a-z]/i.test(categoryOriginal)) return categoryToIndonesian(categoryOriginal);
  const hit = CATEGORY_ID.find(([re]) => re.test(nameOriginal));
  return hit ? hit[1] : "";
}

/** Kata Mandarin umum di packing list → Indonesia (cadangan bila penerjemah otomatis tidak tersedia). */
const WORDS_ID: Array<[string, string]> = [
  ["猫眼", "Cat Eye"], ["印花", "Motif"], ["纯色", "Polos"], ["电镀", "Chrome"], ["点钻", "Berlian"], ["玻璃珠", "Manik Kaca"],
  ["短短", "Pendek"], ["杏仁", "Almond"], ["方", "Kotak"], ["织带盒", "Kotak Pita"], ["烫银", "Foil Perak"], ["大开窗盒", "Kotak Jendela"],
  ["蝴蝶卡头", "Kartu Kupu-kupu"], ["花朵盒", "Kotak Bunga"], ["吸塑泡壳", "Blister"], ["吸塑整套", "Set Blister"], ["吸塑", "Blister"],
  ["盒子", "Kotak"], ["外盒", "Kotak Luar"], ["工具包", "Paket Alat"], ["四件套", "Set 4 Pcs"], ["甲", "Kuku"],
  ["发网夹", "Jepit Jaring"], ["发夹", "Jepit"], ["抓夹", "Jepit Cakar"], ["钥匙扣", "Gantungan Kunci"], ["发箍", "Bando"],
  ["粉色系", "Nuansa Pink"], ["款", " Model"], ["葱粉", "Pink"], ["睫毛", "Bulu Mata"], ["贴", "Stiker"]
];

/** Nama sederhana: kategori Indonesia + kata yang dikenali dari nama Mandarin (tanpa karakter Mandarin tersisa). */
export function fallbackIndonesianName(nameOriginal: string, category: string) {
  let text = nameOriginal.replace(/\s+/g, " ").trim();
  for (const [cn, id] of WORDS_ID) text = text.split(cn).join(` ${id} `);
  // Sebagian file menulis nama dalam bahasa Inggris (mis. FAKE NAIL PACKAGING BOX).
  for (const [re, id] of CATEGORY_ID) text = text.replace(new RegExp(re.source, "gi"), ` ${id} `);
  text = text.replace(/[㐀-鿿]+/g, " ").replace(/[，。、；：（）！？【】\uFFFD]/g, " ").replace(/\s+/g, " ").trim();
  // Sisa tanda baca tanpa kata (mis. "+ ,", "*300") dibuang, lalu dibatasi 8 kata supaya ringkas.
  text = text.split(" ").filter((w) => /[A-Za-z0-9\u00C0-\u024F]/.test(w) && !/^[*%]/.test(w) && !/^\d+%$/.test(w)).slice(0, 8).join(" ").replace(/[+,#/]+$/, "").trim();
  // Kata yang sama berulang ("Kemasan Kuku Palsu / Kemasan Kuku Palsu") cukup sekali.
  text = Array.from(new Set(text.split(" / ").map((t) => t.trim()).filter(Boolean))).join(" / ");
  const base = /[a-z]/i.test(category) ? categoryToIndonesian(category) : "";
  if (!text) return base;
  return text.toLowerCase().startsWith(base.toLowerCase()) ? text : `${base} ${text}`;
}

function guessPcsPerUnit(qtyPerCartonPcs: number): { pcs: number; source: ShipmentProduct["pcsPerUnitSource"] } {
  if (qtyPerCartonPcs > 0 && qtyPerCartonPcs % 12 === 0) return { pcs: 12, source: "rumus-12" };
  if (qtyPerCartonPcs > 0 && qtyPerCartonPcs % 10 === 0) return { pcs: 10, source: "rumus-10" };
  return { pcs: 12, source: "tebakan" };
}

const isPcs = (unit: string) => /^(pcs|pc|piece|buah|biji)$/i.test(unit.trim());
const isDozen = (unit: string) => /^(dz|doz|dozen|lusin)$/i.test(unit.trim());

export function computeShipment(
  lines: ShipmentLine[],
  options: { master?: Record<string, MasterHint>; overrides?: Record<string, ShipmentOverride>; translatedNames?: Record<string, string> } = {}
): ShipmentProduct[] {
  const master = options.master ?? {};
  const overrides = options.overrides ?? {};
  // Satuan DZ dikonversi ke pcs supaya semua baris memakai aturan yang sama.
  const norm = lines.map((l) => {
    const dz = isDozen(l.unitInFile);
    return { ...l, dz, qtyPcs: dz ? l.qtyPerCarton * 12 : l.qtyPerCarton, pricePcs: l.unitPrice == null ? null : dz ? l.unitPrice / 12 : l.unitPrice };
  });

  // Kelompok karton: baris dengan CTNS membuka karton baru; baris tanpa CTNS menumpang.
  const cbmByIndex = new Map<number, number>();
  let group: number[] = [];
  const flush = () => {
    if (!group.length) return;
    const head = norm[group[0]];
    const totalCbm = head.cbmPerCarton != null ? head.cbmPerCarton * (head.cartons ?? 1) : null;
    const pcsOf = (i: number) => (norm[i].cartons ?? 1) * norm[i].qtyPcs;
    const totalPcs = group.reduce((s, i) => s + pcsOf(i), 0);
    for (const i of group) if (totalCbm != null && totalPcs > 0) cbmByIndex.set(i, (totalCbm * pcsOf(i)) / totalPcs);
    group = [];
  };
  norm.forEach((l, i) => {
    if (l.cartons != null) flush();
    group.push(i);
  });
  flush();

  const bySku = new Map<string, number[]>();
  norm.forEach((l, i) => bySku.set(l.sku, [...(bySku.get(l.sku) ?? []), i]));

  return Array.from(bySku.entries()).map(([sku, idx]) => {
    const rows = idx.map((i) => norm[i]);
    const warnings: string[] = [];
    const m = master[sku.toLowerCase()];
    const first = rows[0];
    const fullCarton = rows.find((r) => r.cartons != null && r.cartons > 0) ?? first;
    const totalPcs = rows.reduce((s, r) => s + (r.cartons ?? 1) * r.qtyPcs, 0);
    const cartons = rows.reduce((s, r) => s + (r.cartons ?? 0), 0);

    let pcs: number;
    let source: ShipmentProduct["pcsPerUnitSource"];
    const override = overrides[sku]?.pcsPerUnit;
    const fromMaster = m?.pcsPerUnit ?? (m && isPcs(m.unit) ? 1 : null) ?? (m?.unitsPerKoli && fullCarton.qtyPcs % m.unitsPerKoli === 0 ? fullCarton.qtyPcs / m.unitsPerKoli : null);
    if (override && override > 0) { pcs = override; source = "manual"; }
    else if (fromMaster && fromMaster > 0) { pcs = fromMaster; source = "master"; }
    else if (fullCarton.dz) { pcs = 12; source = "file-dz"; }
    else ({ pcs, source } = guessPcsPerUnit(fullCarton.qtyPcs));
    if (source === "tebakan") warnings.push(`Isi ${fullCarton.qtyPcs} pcs/karton tidak habis dibagi 12 maupun 10. Cek isi pcs per pack.`);

    const quantity = round(totalPcs / pcs, 2);
    if (quantity !== Math.round(quantity)) warnings.push(`Stok ${quantity} tidak bulat dengan isi ${pcs} pcs. Cek isi pcs per pack.`);
    const unitsPerKoli = fullCarton.cartons != null ? round(fullCarton.qtyPcs / pcs, 2) : null;
    if (unitsPerKoli == null) warnings.push("Hanya ada di karton campur, isi per koli tidak diisi.");
    const qtyVariants = new Set(rows.filter((r) => r.cartons != null).map((r) => r.qtyPcs));
    if (qtyVariants.size > 1) warnings.push(`Isi karton berbeda-beda (${Array.from(qtyVariants).join(", ")} pcs); isi per koli memakai karton pertama.`);

    const priced = rows.filter((r) => r.pricePcs != null && r.pricePcs > 0);
    const prices = new Set(priced.map((r) => r.pricePcs));
    if (!priced.length) warnings.push("Harga per pcs kosong, modal tidak dihitung dari RMB.");
    if (prices.size > 1) warnings.push(`Harga per pcs berbeda (${Array.from(prices).join(", ")}); memakai rata-rata tertimbang.`);
    const pricePcs = priced.length
      ? priced.reduce((s, r) => s + (r.pricePcs as number) * (r.cartons ?? 1) * r.qtyPcs, 0) / priced.reduce((s, r) => s + (r.cartons ?? 1) * r.qtyPcs, 0)
      : null;

    const cbmTotal = idx.reduce((s, i) => s + (cbmByIndex.get(i) ?? 0), 0);
    if (!idx.some((i) => cbmByIndex.has(i))) warnings.push("CBM kosong, ongkir per satuan tidak dihitung.");
    const names = Array.from(new Set(rows.map((r) => r.nameOriginal).filter(Boolean)));
    if (names.length > 1) warnings.push(`Satu kode dipakai beberapa nama: ${names.join(" / ")}.`);

    const category = categoryFor(first.categoryOriginal || "", names.join(" "));
    const proposed = overrides[sku]?.name?.trim()
      || (m?.hasRealName ? m.name : "")
      || options.translatedNames?.[sku]
      || fallbackIndonesianName(names.join(" / "), first.categoryOriginal || "");

    return {
      sku,
      rows: rows.map((r) => r.rowNumber),
      name: proposed,
      nameOriginal: names.join(" / "),
      category,
      exists: Boolean(m),
      unit: m?.unit || (pcs === 12 ? "Lusin" : "Pack"),
      pcsPerUnit: pcs,
      pcsPerUnitSource: source,
      totalPcs,
      quantity,
      cartons,
      unitsPerKoli,
      priceRmb: pricePcs == null ? null : round(pricePcs * pcs, 4),
      cbmPerUnit: cbmTotal > 0 && quantity > 0 ? round(cbmTotal / quantity, 6) : null,
      warnings
    };
  });
}

/** Modal per satuan dari harga RMB, kurs, CBM, dan tarif CBM (Rp). */
export function shipmentUnitCost(p: Pick<ShipmentProduct, "priceRmb" | "cbmPerUnit">, rmbRate: number | null, cbmRate: number | null) {
  if (p.priceRmb == null || !rmbRate) return null;
  return Math.round((p.priceRmb * rmbRate + (p.cbmPerUnit ?? 0) * (cbmRate ?? 0)) * 100) / 100;
}

/** Mark-up = (harga jual − modal) ÷ modal, dalam persen. null bila modal atau harga jual belum ada. */
export function markupPercent(cost: number | null | undefined, sellingPrice: number | null | undefined) {
  if (!cost || cost <= 0 || !sellingPrice || sellingPrice <= 0) return null;
  return Math.round(((sellingPrice - cost) / cost) * 1000) / 10;
}
