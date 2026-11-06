import "server-only";
import { prisma } from "@/lib/db/prisma";
import { listWhatsappRecipients, sendWhatsappMessage } from "@/lib/whatsapp/whatsappClient";
import {
  announcementText,
  currentSlot,
  DEFAULT_SETTINGS,
  isLate,
  normalizeSettings,
  whatsappText,
  wib,
  type LateCandidate,
  type PackingVoiceSettings,
} from "./packingVoiceRules";

const SETTINGS_KEY = "cctv_packing_voice";
// Nota kemarin yang belum dikemas tetap diumumkan pagi berikutnya; yang lebih lama diabaikan.
const LOOKBACK_DAYS = 2;

export async function getPackingVoiceSettings(): Promise<PackingVoiceSettings> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
    return row ? normalizeSettings(JSON.parse(row.value)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function savePackingVoiceSettings(input: unknown, user: { id: string; name: string }) {
  const next = normalizeSettings(input);
  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: {
      key: SETTINGS_KEY,
      value: JSON.stringify(next),
      description: "Pengingat suara packing di kamera CCTV: aktif, mode uji, hari libur.",
      updatedByUserId: user.id,
      updatedByNameSnapshot: user.name,
    },
    update: { value: JSON.stringify(next), updatedByUserId: user.id, updatedByNameSnapshot: user.name },
  });
  return next;
}

/** Penjualan disetujui yang 1,5 jam setelah transaksi belum punya label QR tercatat CCTV. */
export async function findLateUnpacked(now: Date): Promise<LateCandidate[]> {
  const since = new Date(`${wib(new Date(now.getTime() - (LOOKBACK_DAYS - 1) * 86_400_000)).day}T00:00:00+07:00`);
  const sales = await prisma.salesRecord.findMany({
    where: {
      approvalStatus: "approved",
      isTestTransaction: false,
      OR: [{ transactionAt: { gte: since } }, { transactionAt: null, createdAt: { gte: since } }],
    },
    select: { id: true, customerName: true, transactionNumber: true, erpInvoiceNumber: true, transactionAt: true, createdAt: true },
  });
  const due = sales
    .map((s) => ({ ...s, at: s.transactionAt ?? s.createdAt }))
    .filter((s) => isLate(s.at, now));
  if (!due.length) return [];
  const numbers = due.flatMap((s) => [s.transactionNumber, s.erpInvoiceNumber]).filter((n): n is string => Boolean(n && n.trim().length >= 3));
  const packed = await prisma.cctvDetectionLog.findMany({
    where: { OR: [{ salesRecordId: { in: due.map((s) => s.id) } }, { invoiceNumber: { in: numbers } }, { slmReference: { in: numbers } }] },
    select: { salesRecordId: true, invoiceNumber: true, slmReference: true },
  });
  const seenIds = new Set(packed.map((p) => p.salesRecordId).filter(Boolean));
  const seenNumbers = new Set(packed.flatMap((p) => [p.invoiceNumber, p.slmReference]).filter(Boolean));
  return due
    .filter((s) => !seenIds.has(s.id) && !seenNumbers.has(s.transactionNumber ?? "") && !seenNumbers.has(s.erpInvoiceNumber ?? ""))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((s) => ({ id: s.id, customerName: s.customerName, invoiceNumber: s.transactionNumber || s.erpInvoiceNumber || null, at: s.at }));
}

type SpeakResult = { played: boolean; reason: string };

/** Kirim kalimat ke layanan speaker di server CCTV (docs/pengumuman-suara.md di repo SLM). */
export async function speakOnCamera(text: string, dryRun: boolean): Promise<SpeakResult> {
  const url = process.env.CCTV_SPEAKER_URL;
  const token = process.env.CCTV_SPEAKER_TOKEN;
  if (!url || !token) return { played: false, reason: "CCTV_SPEAKER_URL dan CCTV_SPEAKER_TOKEN belum diisi" };
  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/speak`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, dry_run: dryRun }),
      signal: AbortSignal.timeout(170_000),
    });
    const data = (await response.json().catch(() => ({}))) as { played?: boolean; reason?: string; message?: string; error?: string };
    if (!response.ok) return { played: false, reason: data.message || data.error || `HTTP ${response.status}` };
    return { played: Boolean(data.played), reason: data.reason || "" };
  } catch (error) {
    return { played: false, reason: error instanceof Error ? error.message : "server CCTV tidak menjawab" };
  }
}

export async function previewOnCamera(text: string): Promise<Response> {
  const url = process.env.CCTV_SPEAKER_URL;
  const token = process.env.CCTV_SPEAKER_TOKEN;
  if (!url || !token) throw new Error("CCTV_SPEAKER_URL dan CCTV_SPEAKER_TOKEN belum diisi");
  return fetch(`${url.replace(/\/+$/, "")}/preview`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(60_000),
  });
}

function outcomeLabel(result: SpeakResult, dryRun: boolean) {
  if (result.played) return "diputar di speaker";
  if (dryRun) return "mode uji, tidak diputar";
  return `gagal (${result.reason || "tanpa keterangan"})`;
}

/** Tugas per jam: satu pengumuman per slot jam; slot yang gagal boleh dicoba lagi. */
export async function runPackingVoiceReminder(now = new Date()) {
  const settings = await getPackingVoiceSettings();
  if (!settings.enabled) return { skipped: "tidak aktif" };
  const slot = currentSlot(now, settings.holidays);
  if ("skip" in slot) return { skipped: slot.skip };
  const earlier = await prisma.cctvVoiceAnnouncement.findUnique({ where: { slotKey: slot.slot } });
  if (earlier && earlier.status !== "failed") return { skipped: "slot ini sudah diumumkan", slot: slot.slot };

  const late = await findLateUnpacked(now);
  if (!late.length) return { skipped: "semua nota sudah tercatat dikemas", slot: slot.slot };

  const text = announcementText(late);
  const result = await speakOnCamera(text, settings.dryRun);
  const status = result.played ? "played" : settings.dryRun && !result.reason.startsWith("HTTP") ? "dry_run" : "failed";
  const record = {
    invoiceCount: late.length,
    salesRecordIds: late.map((s) => s.id),
    invoices: late.map((s) => ({ customerName: s.customerName, invoiceNumber: s.invoiceNumber })),
    text,
    status,
    detail: result.reason || null,
  };
  const saved = earlier
    ? await prisma.cctvVoiceAnnouncement.update({ where: { slotKey: slot.slot }, data: record })
    : await prisma.cctvVoiceAnnouncement.create({ data: { slotKey: slot.slot, ...record } });

  const recipients = (await listWhatsappRecipients()).filter((r) => r.isActive && r.receivesPackingReminder);
  const message = whatsappText(slot.slot, late, outcomeLabel(result, settings.dryRun));
  await Promise.allSettled(recipients.map((r) => sendWhatsappMessage(r, "packing_reminder", message)));

  return { slot: slot.slot, status: saved.status, invoices: late.length, whatsapp: recipients.length };
}

export async function listVoiceAnnouncements(limit = 30) {
  return prisma.cctvVoiceAnnouncement.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
