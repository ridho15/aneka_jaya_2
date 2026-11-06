import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/lib/auth/roles";
import { postJournalEntry, reverseJournalEntry } from "./journalStore";
import { accountForRole, lineFor } from "./accountRoles";

/**
 * Jurnal persediaan dari dokumen stok (nilai FIFO dari pergerakan):
 * - Barang Masuk / packing list (STOCK_IN): Dr Persediaan, Cr Utang Barang Diterima Belum Dibayar.
 * - Opname & penyesuaian: selisih lebih Dr Persediaan / Cr Selisih Persediaan; selisih kurang kebalikannya.
 * Penerimaan dari PO (GRN) tidak dijurnal di sini karena invoice pembelian yang mendebit persediaan.
 * Transfer antar lokasi tidak dijurnal (nilai total tidak berubah). Saldo awal (lapisan OPENING) tidak dijurnal.
 */

export const JOURNALED_DOCUMENTS = ["STOCK_IN", "OPNAME", "ADJUSTMENT"] as const;
export type JournaledDocument = (typeof JOURNALED_DOCUMENTS)[number];

const SYSTEM_ACTOR = { id: "system:inventory", name: "Jurnal Otomatis Persediaan", role: "OWNER" as Role };
const r2 = (n: number) => Math.round(n * 100) / 100;

export const inventorySourceId = (referenceType: string, referenceId: string) => `${referenceType}:${referenceId}`;

type MovementForJournal = { id: string; type: string; totalCost: unknown; costComplete: boolean; movementDate: Date; referenceNumber: string | null };

async function documentMovements(referenceType: JournaledDocument, referenceId: string) {
  const rows = await prisma.inventoryMovement.findMany({
    where: { referenceType, referenceId },
    select: { id: true, type: true, totalCost: true, costComplete: true, movementDate: true, referenceNumber: true },
    orderBy: { createdAt: "asc" }
  });
  const openingIds = new Set(
    (await prisma.inventoryCostLayer.findMany({ where: { movementId: { in: rows.map((r) => r.id) }, inLedger: false }, select: { movementId: true } }))
      .map((l) => l.movementId)
  );
  return { rows: rows as MovementForJournal[], openingIds };
}

/** Hitung nilai jurnal dokumen stok tanpa menyimpan apa pun (dipakai juga oleh dry-run). */
export async function previewInventoryDocumentJournal(referenceType: JournaledDocument, referenceId: string) {
  const { rows, openingIds } = await documentMovements(referenceType, referenceId);
  let increase = 0;
  let decrease = 0;
  let opening = 0;
  let incomplete = 0;
  for (const m of rows) {
    if (m.totalCost == null) continue;
    const value = Number(m.totalCost);
    if (!m.costComplete) incomplete += 1;
    if (value > 0 && openingIds.has(m.id)) opening += value;
    else if (value > 0) increase += value;
    else decrease += -value;
  }
  return {
    entryDate: rows[0]?.movementDate ?? new Date(),
    referenceNumber: rows[0]?.referenceNumber ?? referenceId,
    increase: r2(increase), decrease: r2(decrease), opening: r2(opening), incomplete, movements: rows.length
  };
}

export async function postInventoryDocumentJournal(referenceType: JournaledDocument, referenceId: string) {
  const v = await previewInventoryDocumentJournal(referenceType, referenceId);
  if (v.increase <= 0 && v.decrease <= 0) return null;
  const inventory = await accountForRole("INVENTORY");
  const lines = [];
  let description: string;
  if (referenceType === "STOCK_IN") {
    const payable = await accountForRole("GOODS_RECEIVED_PAYABLE");
    description = `Barang masuk ${v.referenceNumber}`;
    lines.push(lineFor(inventory, v.increase, 0, description), lineFor(payable, 0, v.increase, `Belum dibayar: ${v.referenceNumber}`));
  } else {
    const variance = await accountForRole("INVENTORY_VARIANCE");
    description = `${referenceType === "OPNAME" ? "Selisih opname" : "Penyesuaian stok"} ${v.referenceNumber}`;
    if (v.increase > 0) lines.push(lineFor(inventory, v.increase, 0, `${description} (lebih)`), lineFor(variance, 0, v.increase, `${description} (lebih)`));
    if (v.decrease > 0) lines.push(lineFor(variance, v.decrease, 0, `${description} (kurang)`), lineFor(inventory, 0, v.decrease, `${description} (kurang)`));
  }
  return postJournalEntry({
    entryDate: v.entryDate,
    sourceType: "INVENTORY",
    sourceId: inventorySourceId(referenceType, referenceId),
    postingType: "VALUATION",
    description: v.incomplete ? `${description} · ${v.incomplete} baris modal belum lengkap` : description,
    lines
  }, SYSTEM_ACTOR);
}

/** Dokumen stok bernilai yang belum punya jurnal (gagal posting, periode ditutup, atau data sebelum fitur ini). */
export async function listUnpostedInventoryDocuments(limit = 200) {
  const docs = await prisma.inventoryMovement.groupBy({
    by: ["referenceType", "referenceId"],
    where: { referenceType: { in: [...JOURNALED_DOCUMENTS] }, referenceId: { not: null }, totalCost: { not: null } },
    _sum: { totalCost: true },
    _min: { movementDate: true, referenceNumber: true }
  });
  const sourceIds = docs.map((d) => inventorySourceId(d.referenceType, d.referenceId!));
  const posted = new Set(
    (await prisma.journalEntry.findMany({ where: { sourceType: "INVENTORY", sourceId: { in: sourceIds } }, select: { sourceId: true } })).map((j) => j.sourceId)
  );
  const pending = [];
  for (const d of docs) {
    const sourceId = inventorySourceId(d.referenceType, d.referenceId!);
    if (posted.has(sourceId)) continue;
    const preview = await previewInventoryDocumentJournal(d.referenceType as JournaledDocument, d.referenceId!);
    if (preview.increase <= 0 && preview.decrease <= 0) continue;
    pending.push({ referenceType: d.referenceType as JournaledDocument, referenceId: d.referenceId!, date: d._min.movementDate, ...preview });
    if (pending.length >= limit) break;
  }
  return pending;
}

export async function postPendingInventoryJournals() {
  const pending = await listUnpostedInventoryDocuments(500);
  let posted = 0;
  const errors: Array<{ referenceNumber: string | null; message: string }> = [];
  for (const doc of pending) {
    try {
      if (await postInventoryDocumentJournal(doc.referenceType, doc.referenceId)) posted += 1;
    } catch (error) {
      errors.push({ referenceNumber: doc.referenceNumber, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { posted, errors };
}

/** Posting setelah dokumen tersimpan; kegagalan tidak membatalkan stok dan tetap terlihat di rekonsiliasi. */
export async function postInventoryDocumentJournalSafely(referenceType: JournaledDocument, referenceId: string | undefined | null) {
  if (!referenceId) return;
  await postInventoryDocumentJournal(referenceType, referenceId).catch((error) => {
    console.error(`[JOURNAL] Persediaan ${referenceType} ${referenceId} belum dijurnal:`, error);
  });
}

// ---------------------------------------------------------------------
// HPP penjualan dari pergerakan stok
// ---------------------------------------------------------------------

/**
 * Biaya barang yang keluar untuk satu penjualan (per referensi pelepasan stok).
 * Milik SLM: biaya FIFO (mengurangi persediaan). Titipan: modal titipan yang menjadi hak penitip.
 */
export async function saleStockCost(releaseReference: string | null | undefined) {
  if (!releaseReference) return null;
  const rows = await prisma.inventoryMovement.findMany({
    where: { referenceType: "SALE", referenceNumber: releaseReference, type: "SALE_OUT" },
    select: { productId: true, quantity: true, totalCost: true, costComplete: true, costNote: true, product: { select: { sku: true, ownership: true, costPrice: true, consignorName: true } } }
  });
  if (!rows.length) return null;
  const own = rows.filter((r) => r.product.ownership !== "CONSIGNMENT");
  if (own.some((r) => r.totalCost == null)) return null;
  const notes = own.filter((r) => !r.costComplete).map((r) => `${r.product.sku}: ${r.costNote ?? "modal belum lengkap"}`);
  const byProduct = rows.map((r) => {
    const qty = -Number(r.quantity);
    const consignment = r.product.ownership === "CONSIGNMENT";
    if (consignment && !(Number(r.product.costPrice) > 0)) notes.push(`${r.product.sku}: modal titipan belum diisi`);
    return { productId: r.productId, quantity: qty, consignment, cost: consignment ? r2(qty * Number(r.product.costPrice)) : -Number(r.totalCost) };
  });
  const ownTotal = r2(byProduct.filter((p) => !p.consignment).reduce((s, p) => s + p.cost, 0));
  const consignmentTotal = r2(byProduct.filter((p) => p.consignment).reduce((s, p) => s + p.cost, 0));
  return { total: r2(ownTotal + consignmentTotal), ownTotal, consignmentTotal, complete: notes.length === 0, notes, byProduct };
}

/** Modal per satuan barang saat dijual (FIFO), untuk retur supaya barang kembali dengan nilai yang sama. */
export async function saleUnitCost(releaseReference: string | null | undefined, product: { productId?: string | null; sku?: string | null }) {
  const cost = await saleStockCost(releaseReference);
  if (!cost) return null;
  let productId = product.productId ?? undefined;
  if (product.sku && !cost.byProduct.some((p) => p.productId === productId)) {
    productId = (await prisma.inventoryProduct.findUnique({ where: { sku: product.sku }, select: { id: true } }))?.id;
  }
  const lines = cost.byProduct.filter((p) => p.productId === productId);
  const qty = lines.reduce((s, p) => s + p.quantity, 0);
  return qty > 0 ? r2(lines.reduce((s, p) => s + p.cost, 0) / qty) : null;
}

/** Balik jurnal HPP lama bila pelepasan stoknya sudah diganti (penjualan diedit). */
export async function reverseStaleCogsJournal(journalId: string | null | undefined, currentSourceId: string, actor: { id: string; name: string; role: Role }) {
  if (!journalId) return;
  const old = await prisma.journalEntry.findUnique({ where: { id: journalId }, select: { id: true, sourceId: true, status: true } });
  if (!old || old.sourceId === currentSourceId || old.status !== "POSTED") return;
  await reverseJournalEntry(old.id, actor, "Penjualan diedit: HPP dihitung ulang dari stok yang baru");
}
