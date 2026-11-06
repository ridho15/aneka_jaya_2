import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/lib/auth/roles";
import { recordAudit } from "@/lib/audit/store";
import { postJournalEntry } from "./journalStore";
import { ACCOUNT_ROLES, accountForRole, accountRoleStatus, lineFor } from "./accountRoles";
import { listUnpostedInventoryDocuments } from "./inventoryPosting";
import { createAssetFromExpense, getFixedAssetPolicy } from "./fixedAssets";
import { postExpenseJournal } from "./postingHooks";
import { getTaxStatus } from "./taxStatus";
import { LEDGER_JOURNAL_STATUS } from "./ledgerStatus";

const r0 = (n: number) => Math.round(n);

/** Saldo debit − kredit satu akun, termasuk jurnal yang sudah dibalik beserta pembaliknya. */
async function accountBalance(code: string) {
  const agg = await prisma.journalLine.aggregate({
    where: { accountCodeSnapshot: code, journalEntry: { status: LEDGER_JOURNAL_STATUS } },
    _sum: { debit: true, credit: true }
  });
  return Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0);
}

/** Asal mutasi akun persediaan per jenis sumber jurnal. */
async function inventoryLedgerBreakdown() {
  const lines = await prisma.journalLine.findMany({
    where: { accountCodeSnapshot: ACCOUNT_ROLES.INVENTORY.code, journalEntry: { status: LEDGER_JOURNAL_STATUS } },
    select: { debit: true, credit: true, journalEntry: { select: { sourceType: true, postingType: true } } }
  });
  const LABEL: Record<string, string> = {
    "PURCHASE:INVOICE": "Invoice pembelian (modul Pembelian)",
    "SALES:COGS": "HPP penjualan",
    "SALES_RETURN:RETURN": "Retur penjualan",
    "INVENTORY:VALUATION": "Barang masuk, opname & penyesuaian",
    "MANUAL:MANUAL": "Jurnal manual",
    "CORRECTION:RECLASS_MERCHANDISE": "Koreksi: pembelian barang dari pengeluaran",
    "EXPENSE:DISBURSEMENT": "Pengeluaran langsung ke persediaan"
  };
  const map = new Map<string, { label: string; debit: number; credit: number; count: number }>();
  for (const l of lines) {
    const key = `${l.journalEntry.sourceType}:${l.journalEntry.postingType}`;
    const isReversal = l.journalEntry.postingType === "REVERSAL";
    const label = isReversal ? "Pembalikan jurnal" : LABEL[key] ?? key;
    const row = map.get(label) ?? { label, debit: 0, credit: 0, count: 0 };
    row.debit += Number(l.debit);
    row.credit += Number(l.credit);
    row.count += 1;
    map.set(label, row);
  }
  return Array.from(map.values()).map((r) => ({ ...r, debit: r0(r.debit), credit: r0(r.credit), net: r0(r.debit - r.credit) })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}

/** Nilai kartu stok: lapisan FIFO + stok yang belum punya lapisan (dinilai modal rata-rata / master). */
async function stockCardValue() {
  const layers = await prisma.inventoryCostLayer.findMany({ where: { remaining: { gt: 0 } }, select: { productId: true, remaining: true, unitCost: true, inLedger: true, costKnown: true } });
  let inLedger = 0;
  let opening = 0;
  let unknownCostQty = 0;
  const layered = new Set<string>();
  for (const l of layers) {
    layered.add(l.productId);
    const v = Number(l.remaining) * Number(l.unitCost);
    if (l.inLedger) inLedger += v;
    else opening += v;
    if (!l.costKnown) unknownCostQty += Number(l.remaining);
  }
  const allLayered = new Set((await prisma.inventoryCostLayer.findMany({ select: { productId: true }, distinct: ["productId"] })).map((r) => r.productId));
  const balances = await prisma.inventoryBalance.findMany({
    where: { quantity: { gt: 0 } },
    select: { productId: true, quantity: true, avgCost: true, product: { select: { costPrice: true } } }
  });
  let unlayered = 0;
  let unlayeredNoCost = 0;
  for (const b of balances) {
    if (allLayered.has(b.productId)) continue;
    const unit = Number(b.avgCost) > 0 ? Number(b.avgCost) : Number(b.product.costPrice);
    if (unit > 0) unlayered += Number(b.quantity) * unit;
    else unlayeredNoCost += 1;
  }
  const openingOriginal = await prisma.inventoryCostLayer.findMany({ where: { inLedger: false }, select: { quantity: true, unitCost: true } });
  return {
    fifoInLedger: r0(inLedger),
    fifoOpening: r0(opening),
    openingOriginal: r0(openingOriginal.reduce((s, l) => s + Number(l.quantity) * Number(l.unitCost), 0)),
    notYetLayered: r0(unlayered),
    notYetLayeredNoCostProducts: unlayeredNoCost,
    unknownCostQty: Math.round(unknownCostQty * 100) / 100,
    total: r0(inLedger + opening + unlayered)
  };
}

/** Penjualan yang HPP-nya kemungkinan memakai estimasi 85% harga jual (aturan lama), dan yang HPP-nya belum lengkap. */
async function cogsQuality() {
  const sales = await prisma.salesRecord.findMany({
    where: { approvalStatus: "approved" },
    select: { id: true, transactionNumber: true, saleDate: true, customerName: true, cogsStatus: true, cogsNote: true, cogsJournalEntryId: true, items: { select: { quantity: true, unitPrice: true } }, cogsJournalEntry: { select: { totalDebit: true, status: true } } },
    orderBy: { saleDate: "desc" },
    take: 20000
  });
  const fallback: Array<{ id: string; number: string | null; date: string; customer: string; cogs: number }> = [];
  const incomplete: Array<{ id: string; number: string | null; date: string; customer: string; note: string | null }> = [];
  let withoutCogs = 0;
  for (const s of sales) {
    if (s.cogsStatus === "INCOMPLETE") incomplete.push({ id: s.id, number: s.transactionNumber, date: s.saleDate.toISOString().slice(0, 10), customer: s.customerName, note: s.cogsNote });
    if (!s.cogsJournalEntryId) { withoutCogs += 1; continue; }
    const cogs = Number(s.cogsJournalEntry?.totalDebit ?? 0);
    const estimate = s.items.reduce((sum, i) => sum + Math.round(Number(i.quantity) * Math.round(Number(i.unitPrice) * 0.85)), 0);
    if (s.cogsJournalEntry?.status === "POSTED" && estimate > 0 && Math.abs(cogs - estimate) <= 1) {
      fallback.push({ id: s.id, number: s.transactionNumber, date: s.saleDate.toISOString().slice(0, 10), customer: s.customerName, cogs });
    }
  }
  return { fallback, fallbackTotal: r0(fallback.reduce((s, x) => s + x.cogs, 0)), incomplete, withoutCogs };
}

// ---------------------------------------------------------------------
// Kandidat koreksi historis (hanya usulan; tidak ada yang berubah sampai disetujui per baris)
// ---------------------------------------------------------------------

export type CorrectionKind = "EQUIPMENT" | "MERCHANDISE";
type Decision = { decision: "APPLIED" | "DISMISSED"; kind: CorrectionKind; by: string; at: string; note?: string; journalId?: string };
const DECISIONS_KEY = "accounting.correction_decisions";

async function readDecisions(): Promise<Record<string, Decision>> {
  const row = await prisma.appSetting.findUnique({ where: { key: DECISIONS_KEY } }).catch(() => null);
  try {
    return row ? (JSON.parse(row.value) as Record<string, Decision>) : {};
  } catch {
    return {};
  }
}
async function writeDecision(expenseId: string, decision: Decision, actor: { id: string; name: string }) {
  const all = await readDecisions();
  all[expenseId] = decision;
  await prisma.appSetting.upsert({
    where: { key: DECISIONS_KEY },
    create: { key: DECISIONS_KEY, value: JSON.stringify(all), description: "Keputusan koreksi historis pembelian (peralatan / barang dagang)", updatedByUserId: actor.id, updatedByNameSnapshot: actor.name },
    update: { value: JSON.stringify(all), updatedByUserId: actor.id, updatedByNameSnapshot: actor.name }
  });
}

const EQUIPMENT_WORDS = ["laptop", "komputer", "pc ", "printer", "scanner", "monitor", "rak", "etalase", "lemari", "meja", "kursi", "ac ", "kulkas", "freezer", "timbangan", "mesin", "cctv", "kamera", "handphone", "hp ", "tablet", "router", "kipas", "dispenser", "troli", "tangga", "genset", "brankas", "pallet", "motor", "mobil", "peralatan", "inventaris"];
const MERCHANDISE_WORDS = ["barang dagang", "kulakan", "restock", "re-stock", "stok barang", "beli barang", "pembelian barang", "supplier", "kuku palsu", "jepit", "bulu mata"];

function signals(text: string, words: string[]) {
  const t = ` ${text.toLowerCase()} `;
  return words.filter((w) => t.includes(w)).map((w) => w.trim());
}

export type CorrectionCandidate = {
  expenseId: string;
  kind: CorrectionKind;
  date: string;
  description: string;
  vendor: string | null;
  amount: number;
  posted: boolean;
  currentAccount: string;
  proposedAccount: string;
  reasons: string[];
  hasDocument: boolean;
  decision: Decision | null;
};

export async function listCorrectionCandidates(): Promise<CorrectionCandidate[]> {
  const [policy, decisions] = await Promise.all([getFixedAssetPolicy(), readDecisions()]);
  const expenses = await prisma.expenseRecord.findMany({
    where: { approvalStatus: "approved", categoryCode: { notIn: ["employee_loan", "operational_advance", "salary", "purchase_advance", "supplies"] } },
    select: { id: true, expenseDate: true, description: true, vendorName: true, category: true, categoryCode: true, coaId: true, coaNameSnapshot: true, amount: true, attachmentUrl: true, journalEntryId: true },
    orderBy: { expenseDate: "asc" }
  });
  const journals = await prisma.journalEntry.findMany({
    where: { id: { in: expenses.map((e) => e.journalEntryId).filter((x): x is string => Boolean(x)) } },
    select: { id: true, status: true, lines: { where: { debit: { gt: 0 } }, select: { accountCodeSnapshot: true, accountNameSnapshot: true } } }
  });
  const journalById = new Map(journals.map((j) => [j.id, j]));
  const out: CorrectionCandidate[] = [];
  for (const e of expenses) {
    const amount = Number(e.amount);
    const text = `${e.description ?? ""} ${e.category ?? ""} ${e.vendorName ?? ""}`;
    const journal = e.journalEntryId ? journalById.get(e.journalEntryId) : undefined;
    const debit = journal?.lines[0];
    const currentAccount = debit ? `${debit.accountCodeSnapshot} ${debit.accountNameSnapshot}` : "belum dijurnal";
    const debitCode = debit?.accountCodeSnapshot ?? "";
    const posted = journal?.status === "POSTED";
    // Sudah benar: jangan diusulkan lagi.
    if ([ACCOUNT_ROLES.EQUIPMENT.code, ACCOUNT_ROLES.INVENTORY.code, ACCOUNT_ROLES.GOODS_RECEIVED_PAYABLE.code].includes(debitCode)) continue;
    if (e.categoryCode === "equipment" && posted) continue;

    const eqWords = signals(text, EQUIPMENT_WORDS);
    const mdWords = signals(text, MERCHANDISE_WORDS);
    const reasons: string[] = [];
    let kind: CorrectionKind | null = null;
    if (e.categoryCode === "goods_purchase" || /pembelian/i.test(e.category ?? "") || (e.coaId ?? "").toLowerCase() === "pembelian") {
      kind = "MERCHANDISE";
      reasons.push(e.categoryCode === "goods_purchase" ? "Kategori: Pembelian barang" : "Kategori/COA: Pembelian");
      if (mdWords.length) reasons.push(`Teks: ${mdWords.join(", ")}`);
    } else if (amount >= policy.capitalizationThreshold && (eqWords.length || debitCode === "6-1004")) {
      kind = "EQUIPMENT";
      reasons.push(`Nominal ≥ batas kapitalisasi ${policy.capitalizationThreshold.toLocaleString("id-ID")}`);
      if (eqWords.length) reasons.push(`Teks: ${eqWords.join(", ")}`);
      if (debitCode === "6-1004") reasons.push("Dicatat di Pemeliharaan & Perbaikan");
    } else if (e.categoryCode === "equipment") {
      kind = "EQUIPMENT";
      reasons.push("Kategori: Peralatan (belum dijurnal)");
    }
    if (!kind) continue;
    if (!e.attachmentUrl) reasons.push("Tanpa bukti/lampiran");
    out.push({
      expenseId: e.id, kind, date: e.expenseDate.toISOString().slice(0, 10), description: e.description ?? e.category ?? "-", vendor: e.vendorName, amount,
      posted, currentAccount,
      proposedAccount: kind === "EQUIPMENT" ? `${ACCOUNT_ROLES.EQUIPMENT.code} ${ACCOUNT_ROLES.EQUIPMENT.name}` : `${ACCOUNT_ROLES.INVENTORY.code} ${ACCOUNT_ROLES.INVENTORY.name}`,
      reasons, hasDocument: Boolean(e.attachmentUrl), decision: decisions[e.id] ?? null
    });
  }
  return out;
}

/**
 * Terapkan satu koreksi yang sudah ditinjau. Yang sudah dijurnal: jurnal koreksi baru (tanggal hari ini,
 * memo menyebut tanggal asli), jurnal asli tetap ada. Yang belum dijurnal: dijurnal langsung ke akun yang benar.
 * Aman diulang: kunci jurnal per pengeluaran.
 */
export async function applyCorrection(expenseId: string, kind: CorrectionKind, actor: { id: string; name: string; role: Role }) {
  const candidate = (await listCorrectionCandidates()).find((c) => c.expenseId === expenseId);
  const decisions = await readDecisions();
  if (decisions[expenseId]?.decision === "APPLIED") return { alreadyApplied: true, journalId: decisions[expenseId].journalId };
  if (!candidate) throw new Error("Pengeluaran ini tidak ada di daftar kandidat koreksi (mungkin sudah benar).");
  const expense = await prisma.expenseRecord.findUnique({ where: { id: expenseId } });
  if (!expense) throw new Error("Pengeluaran tidak ditemukan.");
  const originalJournal = expense.journalEntryId ? await prisma.journalEntry.findUnique({ where: { id: expense.journalEntryId }, include: { lines: true } }) : null;
  const amount = Number(expense.amount);
  const target = await accountForRole(kind === "EQUIPMENT" ? "EQUIPMENT" : "INVENTORY");
  let journalId: string | undefined;

  if (originalJournal?.status === "POSTED") {
    const original = originalJournal.lines.find((l) => Number(l.debit) > 0);
    if (!original) throw new Error("Jurnal asli tidak punya baris debit.");
    const memo = `Koreksi ${originalJournal.journalNumber} (${expense.expenseDate.toISOString().slice(0, 10)}): ${expense.description ?? ""}`.slice(0, 250);
    const journal = await postJournalEntry({
      entryDate: new Date(), sourceType: "CORRECTION", sourceId: `expense:${expense.id}`, postingType: `RECLASS_${kind}`,
      description: `${kind === "EQUIPMENT" ? "Reklasifikasi ke aset tetap" : "Reklasifikasi ke persediaan"}: ${memo}`,
      attachmentUrl: expense.attachmentUrl,
      lines: [
        lineFor(target, amount, 0, memo),
        { accountId: original.accountId, accountCodeSnapshot: original.accountCodeSnapshot, accountNameSnapshot: original.accountNameSnapshot, debit: 0, credit: amount, memo }
      ]
    }, actor);
    journalId = journal.id;
    if (kind === "EQUIPMENT") await createAssetFromExpense(expense);
  } else if (kind === "EQUIPMENT") {
    await prisma.expenseRecord.update({ where: { id: expense.id }, data: { categoryCode: "equipment" } });
    journalId = (await postExpenseJournal(expense.id, actor))?.id;
  } else {
    const cash = await prisma.account.findUnique({ where: { code: "1-1001" } });
    if (!cash) throw new Error("Akun Kas & Bank (1-1001) tidak ditemukan.");
    const memo = `Pembelian barang dagang (${expense.expenseDate.toISOString().slice(0, 10)}): ${expense.description ?? ""}`.slice(0, 250);
    const journal = await postJournalEntry({
      entryDate: expense.expenseDate, sourceType: "EXPENSE", sourceId: expense.id, postingType: "DISBURSEMENT",
      description: memo, attachmentUrl: expense.attachmentUrl,
      lines: [lineFor(target, amount, 0, memo), lineFor(cash, 0, amount, `Rekening: ${expense.rekeningNameSnapshot || "Kas/Bank"}`)]
    }, actor);
    await prisma.expenseRecord.update({ where: { id: expense.id }, data: { postingStatus: "posted", journalEntryId: journal.id } });
    journalId = journal.id;
  }

  await writeDecision(expenseId, { decision: "APPLIED", kind, by: actor.name, at: new Date().toISOString(), journalId }, actor);
  await recordAudit({ entityType: "accounting_correction", entityId: expenseId, action: "update", afterValue: { kind, journalId, amount }, reason: `Koreksi historis ${kind} disetujui ${actor.name}` }).catch(() => undefined);
  return { alreadyApplied: false, journalId };
}

export async function dismissCorrection(expenseId: string, kind: CorrectionKind, note: string, actor: { id: string; name: string }) {
  await writeDecision(expenseId, { decision: "DISMISSED", kind, by: actor.name, at: new Date().toISOString(), note: note.slice(0, 300) }, actor);
}

// ---------------------------------------------------------------------
// Laporan lengkap
// ---------------------------------------------------------------------

export async function getInventoryReconciliation() {
  const [ledger, breakdown, stock, cogs, pendingDocs, candidates, roles, tax, policy, payable, advance, equipment, accumulated] = await Promise.all([
    accountBalance(ACCOUNT_ROLES.INVENTORY.code),
    inventoryLedgerBreakdown(),
    stockCardValue(),
    cogsQuality(),
    listUnpostedInventoryDocuments(200),
    listCorrectionCandidates(),
    accountRoleStatus(),
    getTaxStatus(),
    getFixedAssetPolicy(),
    accountBalance(ACCOUNT_ROLES.GOODS_RECEIVED_PAYABLE.code),
    accountBalance(ACCOUNT_ROLES.PURCHASE_ADVANCE.code),
    accountBalance(ACCOUNT_ROLES.EQUIPMENT.code),
    accountBalance(ACCOUNT_ROLES.ACCUMULATED_DEPRECIATION.code)
  ]);
  const open = candidates.filter((c) => !c.decision);
  const merchandiseOpen = open.filter((c) => c.kind === "MERCHANDISE").reduce((s, c) => s + c.amount, 0);
  const pendingIncrease = pendingDocs.reduce((s, d) => s + d.increase - d.decrease, 0);
  const projected = ledger + merchandiseOpen + pendingIncrease;
  const assets = await prisma.fixedAsset.findMany({ select: { acquisitionCost: true, status: true } });
  return {
    generatedAt: new Date().toISOString(),
    ledger: { inventory: r0(ledger), breakdown, goodsReceivedPayable: r0(-payable), purchaseAdvance: r0(advance), equipment: r0(equipment), accumulatedDepreciation: r0(-accumulated) },
    stock,
    difference: r0(stock.total - ledger),
    // Bagian selisih yang sudah ada penjelasannya: nilai stok yang memang belum pernah masuk buku besar.
    unexplained: r0(stock.total - ledger - stock.openingOriginal - stock.notYetLayered - merchandiseOpen - pendingIncrease),
    projectedAfterProposals: { inventory: r0(projected), difference: r0(stock.total - projected), unexplained: r0(stock.total - projected - stock.openingOriginal - stock.notYetLayered), merchandiseOpen: r0(merchandiseOpen), pendingDocuments: r0(pendingIncrease) },
    cogs,
    pendingDocs,
    candidates,
    needsDocuments: open.filter((c) => !c.hasDocument),
    fixedAssets: { count: assets.length, cost: r0(assets.reduce((s, a) => s + Number(a.acquisitionCost), 0)), incomplete: assets.filter((a) => a.status === "DRAFT").length },
    roles,
    tax,
    policy
  };
}

export type InventoryReconciliation = Awaited<ReturnType<typeof getInventoryReconciliation>>;
