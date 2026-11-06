import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const store = { setting: null as null | { value: string }, announcements: new Map<string, { slotKey: string; status: string }>() };
  return {
    store,
    sales: [] as Array<Record<string, unknown>>,
    packed: [] as Array<Record<string, unknown>>,
    sent: [] as string[],
    prisma: {
      appSetting: { findUnique: vi.fn(async () => store.setting) },
      salesRecord: { findMany: vi.fn() },
      cctvDetectionLog: { findMany: vi.fn() },
      cctvVoiceAnnouncement: {
        findUnique: vi.fn(async ({ where }: { where: { slotKey: string } }) => store.announcements.get(where.slotKey) ?? null),
        create: vi.fn(async ({ data }: { data: { slotKey: string; status: string } }) => { store.announcements.set(data.slotKey, data); return data; }),
        update: vi.fn(async ({ where, data }: { where: { slotKey: string }; data: { status: string } }) => {
          const row = { ...store.announcements.get(where.slotKey)!, ...data };
          store.announcements.set(where.slotKey, row);
          return row;
        }),
      },
    },
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/whatsapp/whatsappClient", () => ({
  listWhatsappRecipients: vi.fn(async () => [
    { id: "r1", isActive: true, receivesPackingReminder: true },
    { id: "r2", isActive: true, receivesPackingReminder: false },
  ]),
  sendWhatsappMessage: vi.fn(async (_r: unknown, type: string, body: string) => { mocks.sent.push(`${type}:${body}`); }),
}));

const { runPackingVoiceReminder } = await import("@/lib/cctv/packingVoice");

const at = (t: string) => new Date(`${t}+07:00`);
let speaker: { ok: boolean; played: boolean; reason?: string };

beforeEach(() => {
  mocks.store.setting = { value: JSON.stringify({ enabled: true, dryRun: false, holidays: [] }) };
  mocks.store.announcements.clear();
  mocks.sent.length = 0;
  mocks.sales.length = 0;
  mocks.packed.length = 0;
  mocks.prisma.salesRecord.findMany.mockImplementation(async () => mocks.sales);
  mocks.prisma.cctvDetectionLog.findMany.mockImplementation(async () => mocks.packed);
  speaker = { ok: true, played: true };
  process.env.CCTV_SPEAKER_URL = "https://cctv.example/api/speaker";
  process.env.CCTV_SPEAKER_TOKEN = "x".repeat(40);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ played: speaker.played, reason: speaker.reason ?? "" }), { status: speaker.ok ? 200 : 503 })));
});

function addSale(id: string, name: string, time: string, number: string) {
  mocks.sales.push({ id, customerName: name, transactionNumber: number, erpInvoiceNumber: null, transactionAt: at(time), createdAt: at(time) });
}

describe("tugas pengingat suara packing", () => {
  it("mengumumkan nota yang belum tercatat dikemas, sekali per jam, dan mengirim WhatsApp", async () => {
    addSale("s1", "Toko Hansel", "2026-11-06T09:00:00", "061126-1");
    addSale("s2", "Toko Sinar", "2026-11-06T09:10:00", "061126-2");
    addSale("s3", "Toko Baru", "2026-11-06T13:40:00", "061126-3"); // belum 1,5 jam
    addSale("s4", "Toko Sudah", "2026-11-06T08:00:00", "061126-4");
    mocks.packed.push({ salesRecordId: null, invoiceNumber: "061126-4", slmReference: null }); // label tercatat

    const first = await runPackingVoiceReminder(at("2026-11-06T14:00:00"));
    expect(first).toMatchObject({ slot: "2026-11-06 14", status: "played", invoices: 2, whatsapp: 1 });
    const body = JSON.parse(String((fetch as unknown as { mock: { calls: [string, { body: string }][] } }).mock.calls[0][1].body));
    expect(body.text).toBe("Perhatian tim packing. Ada 2 nota belum diproses. Toko Hansel, Toko Sinar. Segera diproses. Terima kasih.");
    expect(body.dry_run).toBe(false);
    expect(mocks.sent).toHaveLength(1);
    expect(mocks.sent[0]).toContain("packing_reminder:*Pengingat packing 14:00 WIB*");

    const again = await runPackingVoiceReminder(at("2026-11-06T14:10:00"));
    expect(again).toMatchObject({ skipped: "slot ini sudah diumumkan" });
  });

  it("slot yang gagal dicoba lagi pada panggilan berikutnya", async () => {
    addSale("s1", "Toko Hansel", "2026-11-06T09:00:00", "061126-1");
    speaker = { ok: false, played: false, reason: "DVR offline" };
    expect(await runPackingVoiceReminder(at("2026-11-06T14:00:00"))).toMatchObject({ status: "failed" });
    speaker = { ok: true, played: true };
    expect(await runPackingVoiceReminder(at("2026-11-06T14:05:00"))).toMatchObject({ status: "played" });
  });

  it("mode uji: dicatat dan dikirim WhatsApp, tidak diputar", async () => {
    mocks.store.setting = { value: JSON.stringify({ enabled: true, dryRun: true, holidays: [] }) };
    addSale("s1", "Toko Hansel", "2026-11-06T09:00:00", "061126-1");
    speaker = { ok: true, played: false, reason: "dry run: not played on the speaker" };
    expect(await runPackingVoiceReminder(at("2026-11-06T14:00:00"))).toMatchObject({ status: "dry_run" });
    expect(mocks.sent[0]).toContain("Suara: mode uji, tidak diputar");
  });

  it("diam bila mati, setelah 15:00, atau semua sudah dikemas", async () => {
    addSale("s1", "Toko Hansel", "2026-11-06T09:00:00", "061126-1");
    expect(await runPackingVoiceReminder(at("2026-11-06T16:00:00"))).toEqual({ skipped: "lewat pukul 15:00" });
    mocks.packed.push({ salesRecordId: "s1", invoiceNumber: null, slmReference: null });
    expect(await runPackingVoiceReminder(at("2026-11-06T14:00:00"))).toMatchObject({ skipped: "semua nota sudah tercatat dikemas" });
    mocks.store.setting = { value: JSON.stringify({ enabled: false, dryRun: false, holidays: [] }) };
    expect(await runPackingVoiceReminder(at("2026-11-06T14:00:00"))).toEqual({ skipped: "tidak aktif" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
