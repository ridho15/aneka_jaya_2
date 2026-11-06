/** Tujuan pembelian → akun otomatis, aset tetap, penyusutan, neraca, koreksi historis (jalan bila INVENTORY_TEST_DATABASE_URL diset). */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/store", () => ({ recordAudit: async () => undefined }));

const url = process.env.INVENTORY_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("purchase purpose & fixed assets (postgres)", () => {
  let prisma: typeof import("@/lib/db/prisma").prisma;
  let hooks: typeof import("@/lib/accounting/postingHooks");
  let assets: typeof import("@/lib/accounting/fixedAssets");
  let recon: typeof import("@/lib/accounting/inventoryReconciliation");
  let statements: typeof import("@/lib/reports/financialStatements");
  const run = Date.now().toString(36).toUpperCase();
  const actor = { id: "test", name: "Test", role: "OWNER" as const };

  async function expense(id: string, categoryCode: string, amount: number, extra: Record<string, unknown> = {}) {
    const tipe = await prisma.bookkeepingType.findFirst();
    await prisma.expenseRecord.create({ data: {
      id, expenseDate: new Date(), tipeId: tipe!.id, tipeCodeSnapshot: tipe!.code, tipeNameSnapshot: tipe!.name,
      rekeningId: "cash-w", rekeningNameSnapshot: "Kas", coaId: "6-1001", coaNameSnapshot: "6-1001", category: "Uji",
      vendorName: "Toko Uji", description: `Uji ${categoryCode}`, amount, paymentMethod: "Cash", approvalStatus: "approved",
      createdByUserId: "test", createdByNameSnapshot: "Test", createdByRoleSnapshot: "OWNER", createdAt: new Date(), categoryCode, ...extra
    } });
    return id;
  }
  async function debitOf(expenseId: string) {
    const e = await prisma.expenseRecord.findUnique({ where: { id: expenseId } });
    const j = await prisma.journalEntry.findUnique({ where: { id: e!.journalEntryId! }, include: { lines: true } });
    return j!.lines.find((l) => Number(l.debit) > 0)!.accountCodeSnapshot;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ prisma } = await import("@/lib/db/prisma"));
    hooks = await import("@/lib/accounting/postingHooks");
    assets = await import("@/lib/accounting/fixedAssets");
    recon = await import("@/lib/accounting/inventoryReconciliation");
    statements = await import("@/lib/reports/financialStatements");
  });

  it("paying a supplier for goods already in stock reduces the payable, not inventory or expense", async () => {
    const id = await expense(`EXP-GOODS-${run}`, "goods_purchase", 1_000_000);
    await hooks.postExpenseJournal(id, actor);
    expect(await debitOf(id)).toBe("2-1005");
  });

  it("paying the consignor reduces the consignment payable (2-1006), not an expense", async () => {
    const id = await expense(`EXP-TTP-${run}`, "consignment_payment", 150_000);
    await hooks.postExpenseJournal(id, actor);
    expect(await debitOf(id)).toBe("2-1006");
  });

  it("equipment ≥ Rp1 juta becomes a fixed asset; below the threshold it is an expense", async () => {
    const big = await expense(`EXP-EQ-${run}`, "equipment", 2_400_000);
    const small = await expense(`EXP-EQS-${run}`, "equipment", 300_000);
    await hooks.postExpenseJournal(big, actor);
    await hooks.postExpenseJournal(small, actor);
    expect(await debitOf(big)).toBe("1-2001");
    expect(await debitOf(small)).toBe("6-1008");
    const asset = await prisma.fixedAsset.findUnique({ where: { sourceType_sourceId: { sourceType: "EXPENSE", sourceId: big } } });
    expect(asset?.status).toBe("DRAFT");
    expect(await prisma.fixedAsset.count({ where: { sourceId: small } })).toBe(0);
  });

  it("incomplete assets are not depreciated; complete ones are, once per month", async () => {
    const asset = (await prisma.fixedAsset.findUnique({ where: { sourceType_sourceId: { sourceType: "EXPENSE", sourceId: `EXP-EQ-${run}` } } }))!;
    const period = new Date().toISOString().slice(0, 7);
    const first = await assets.postDepreciation(period, actor);
    expect(first.skippedIncomplete.some((s) => s.assetNumber === asset.assetNumber)).toBe(true);
    expect(await prisma.journalEntry.count({ where: { sourceType: "FIXED_ASSET", sourceId: `${asset.id}:${period}` } })).toBe(0);

    await assets.updateFixedAsset(asset.id, { locationName: "Toko", availableForUseDate: `${period}-01`, usefulLifeMonths: 12, residualValue: 0 });
    await assets.postDepreciation(period, actor);
    await assets.postDepreciation(period, actor);
    const journals = await prisma.journalEntry.findMany({ where: { sourceType: "FIXED_ASSET", sourceId: `${asset.id}:${period}` } });
    expect(journals).toHaveLength(1);
    expect(Number(journals[0].totalDebit)).toBe(200_000);
  });

  it("the balance sheet shows equipment as a fixed asset net of accumulated depreciation", async () => {
    const now = new Date();
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const bs = await statements.getBalanceSheet({ asOfDate: monthEnd });
    const assetsSection = (bs as unknown as { assets: { fixedAssets: Array<{ code: string; amount: number }>; currentAssets: Array<{ code: string }> } }).assets;
    const codes = assetsSection.fixedAssets.map((l) => l.code);
    expect(codes).toContain("1-2001");
    expect(codes).toContain("1-2002");
    expect(assetsSection.fixedAssets.find((l) => l.code === "1-2002")!.amount).toBeLessThan(0);
    expect(assetsSection.currentAssets.map((l) => l.code)).not.toContain("1-2001");
  });

  it("a historical equipment purchase booked as an expense is corrected once, with the original journal kept", async () => {
    const id = await expense(`EXP-OLD-${run}`, "operational_expense", 3_000_000, { description: `Beli laptop kasir ${run}`, coaId: "6-1004", coaNameSnapshot: "6-1004" });
    const original = await hooks.postExpenseJournal(id, actor);
    const candidate = (await recon.listCorrectionCandidates()).find((c) => c.expenseId === id);
    expect(candidate?.kind).toBe("EQUIPMENT");
    const first = await recon.applyCorrection(id, "EQUIPMENT", actor);
    const second = await recon.applyCorrection(id, "EQUIPMENT", actor);
    expect(second.alreadyApplied).toBe(true);
    expect(await prisma.journalEntry.count({ where: { sourceType: "CORRECTION", sourceId: `expense:${id}` } })).toBe(1);
    expect((await prisma.journalEntry.findUnique({ where: { id: original!.id } }))?.status).toBe("POSTED");
    const correction = await prisma.journalEntry.findUnique({ where: { id: first.journalId! }, include: { lines: true } });
    expect(correction!.lines.map((l) => [l.accountCodeSnapshot, Number(l.debit), Number(l.credit)])).toEqual([["1-2001", 3_000_000, 0], ["6-1004", 0, 3_000_000]]);
  });
});
