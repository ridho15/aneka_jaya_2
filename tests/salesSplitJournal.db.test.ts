/** Jurnal penjualan Split terhadap PostgreSQL sungguhan (jalan bila INVENTORY_TEST_DATABASE_URL diset). */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/store", () => ({ recordAudit: async () => undefined }));

const url = process.env.INVENTORY_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("split sale journal (postgres)", () => {
  let prisma: typeof import("@/lib/db/prisma").prisma;
  let postSalesInvoiceJournal: typeof import("@/lib/sales/postingHooks").postSalesInvoiceJournal;
  const id = `S-SPLIT-${Date.now()}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    prisma = (await import("@/lib/db/prisma")).prisma;
    ({ postSalesInvoiceJournal } = await import("@/lib/sales/postingHooks"));
    const tf = await prisma.rekeningAccount.findFirst({ where: { id: { not: "cash-w" }, accountId: { not: null } } });
    const cash = await prisma.rekeningAccount.findUnique({ where: { id: "cash-w" } });
    await prisma.salesRecord.create({
      data: {
        id, saleDate: new Date("2026-11-06"), tipeId: "W", tipeCodeSnapshot: "W", tipeNameSnapshot: "W",
        customerName: "Uji Split DB", paymentMethod: "Split", total: 126000, approvalStatus: "approved",
        rekeningId: tf?.id, rekeningNameSnapshot: tf?.name,
        paymentSplits: [
          { method: "Cash", amount: 50000, rekeningId: cash?.id, rekeningNameSnapshot: cash?.name },
          { method: "TF", amount: 76000, rekeningId: tf?.id, rekeningNameSnapshot: tf?.name }
        ],
        createdByUserId: "test", createdByNameSnapshot: "Test", createdByRoleSnapshot: "OWNER", createdAt: new Date()
      }
    });
  });

  it("debits each receiving account for its part and credits sales once", async () => {
    const journal = await postSalesInvoiceJournal(id, { id: "test", name: "Test", role: "OWNER" });
    expect(journal).toBeTruthy();
    const lines = await prisma.journalLine.findMany({ where: { journalEntryId: journal!.id }, orderBy: { sortOrder: "asc" } });
    const debits = lines.filter((l) => Number(l.debit) > 0).map((l) => Number(l.debit)).sort((a, b) => a - b);
    expect(debits).toEqual([50000, 76000]);
    expect(lines.filter((l) => Number(l.credit) > 0).reduce((s, l) => s + Number(l.credit), 0)).toBe(126000);
    // Ulangi: idempoten, tidak ada jurnal kedua.
    const again = await postSalesInvoiceJournal(id, { id: "test", name: "Test", role: "OWNER" });
    expect(again?.id).toBe(journal!.id);
  });
});
