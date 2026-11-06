/** Total per hari di Riwayat Penjualan dari semua nota hari itu, bukan hanya halaman yang tampil (jalan bila INVENTORY_TEST_DATABASE_URL diset). */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/store", () => ({ recordAudit: async () => undefined }));

const url = process.env.INVENTORY_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("sales day totals (postgres)", () => {
  let prisma: typeof import("@/lib/db/prisma").prisma;
  let store: typeof import("@/lib/sales/store");
  const run = Date.now().toString(36).toUpperCase();
  const customer = `Uji Hari ${run}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ prisma } = await import("@/lib/db/prisma"));
    store = await import("@/lib/sales/store");
    const tipe = await prisma.bookkeepingType.findFirst();
    for (let i = 0; i < 12; i++) {
      await prisma.salesRecord.create({ data: {
        id: `DAY-${run}-${i}`, saleDate: new Date("2030-01-15T00:00:00Z"), transactionAt: new Date(`2030-01-15T0${i % 10}:00:00+07:00`),
        tipeId: tipe!.id, tipeCodeSnapshot: tipe!.code, tipeNameSnapshot: tipe!.name, customerName: customer, paymentMethod: "Cash",
        total: 100_000, approvalStatus: i === 11 ? "cancelled" : "approved",
        createdByUserId: "test", createdByNameSnapshot: "Test", createdByRoleSnapshot: "OWNER", createdAt: new Date()
      } });
    }
  });
  afterAll(async () => {
    await prisma.salesRecord.deleteMany({ where: { id: { startsWith: `DAY-${run}-` } } });
  });

  it("counts every non-cancelled sale of the day matching the filter, beyond the 10 on screen", async () => {
    const totals = await store.salesDayTotals({ keyword: customer } as never, undefined, ["2030-01-15"]);
    expect(totals["2030-01-15"]).toEqual({ count: 11, total: 1_100_000 });
  });
});
