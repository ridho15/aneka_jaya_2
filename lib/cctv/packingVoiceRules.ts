/**
 * Pengingat suara packing: aturan murni (tanpa database), dipakai oleh lib/cctv/packingVoice.ts.
 *
 * Nota dianggap terlambat bila 1,5 jam setelah waktu transaksi belum ada label QR yang tercatat CCTV.
 * Pengumuman tiap jam pukul 08:00–15:00 WIB, Senin–Sabtu, kecuali hari libur. Setelah 15:00 tidak ada suara.
 */

export const LATE_AFTER_MINUTES = 90;
export const FIRST_HOUR = 8;
export const LAST_HOUR = 15;
export const MAX_NAMES = 3;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export type PackingVoiceSettings = {
  enabled: boolean;
  dryRun: boolean;
  holidays: string[];
};

// Hari libur nasional bertanggal tetap. Libur bergerak (Idulfitri, Iduladha, Nyepi, Waisak, cuti bersama)
// ditambahkan pemilik di halaman Laporan CCTV setiap tahun.
export const FIXED_HOLIDAYS = [
  "2026-01-01", "2026-05-01", "2026-06-01", "2026-08-17", "2026-12-25",
  "2027-01-01", "2027-05-01", "2027-06-01", "2027-08-17", "2027-12-25",
];

export const DEFAULT_SETTINGS: PackingVoiceSettings = { enabled: false, dryRun: true, holidays: FIXED_HOLIDAYS };

export type LateCandidate = {
  id: string;
  customerName: string;
  invoiceNumber: string | null;
  at: Date;
};

/** Tanggal (YYYY-MM-DD), jam, menit, dan hari (0 = Minggu) dalam WIB. */
export function wib(date: Date) {
  const shifted = new Date(date.getTime() + WIB_OFFSET_MS);
  return {
    day: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** Slot jam pengumuman saat ini ("2026-11-06 14"), atau alasan tidak ada pengumuman. */
export function currentSlot(now: Date, holidays: string[]): { slot: string } | { skip: string } {
  const t = wib(now);
  if (t.weekday === 0) return { skip: "Minggu" };
  if (holidays.includes(t.day)) return { skip: "hari libur" };
  if (t.hour < FIRST_HOUR) return { skip: "belum jam kerja" };
  if (t.hour > LAST_HOUR || (t.hour === LAST_HOUR && t.minute >= 30)) return { skip: "lewat pukul 15:00" };
  if (t.minute >= 30) return { skip: "bukan awal jam" };
  return { slot: `${t.day} ${String(t.hour).padStart(2, "0")}` };
}

export function isLate(at: Date, now: Date) {
  return now.getTime() - at.getTime() >= LATE_AFTER_MINUTES * 60 * 1000;
}

function cleanName(name: string) {
  return name.replace(/\s+/g, " ").trim();
}

/** Kalimat pengumuman, singkat seperti contoh pemilik. */
export function announcementText(late: LateCandidate[]) {
  const names = Array.from(new Set(late.map((s) => cleanName(s.customerName)).filter(Boolean)));
  const shown = names.slice(0, MAX_NAMES);
  const rest = names.length - shown.length;
  const list = shown.join(", ") + (rest > 0 ? `, dan ${rest} lainnya` : "");
  return `Perhatian tim packing. Ada ${late.length} nota belum diproses. ${list}. Segera diproses. Terima kasih.`;
}

/** Ringkasan WhatsApp untuk penerima "pengingat packing". */
export function whatsappText(slot: string, late: LateCandidate[], outcome: string) {
  const hour = slot.slice(11);
  const lines = late.slice(0, 15).map((s) => `- ${cleanName(s.customerName)}${s.invoiceNumber ? ` (${s.invoiceNumber})` : ""}`);
  if (late.length > 15) lines.push(`- dan ${late.length - 15} nota lainnya`);
  return [`*Pengingat packing ${hour}:00 WIB*`, `${late.length} nota belum tercatat dikemas lebih dari 1,5 jam:`, ...lines, "", `Suara: ${outcome}`].join("\n");
}

export function normalizeSettings(raw: unknown): PackingVoiceSettings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<PackingVoiceSettings>;
  const holidays = Array.isArray(value.holidays)
    ? Array.from(new Set(value.holidays.map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))).sort()
    : DEFAULT_SETTINGS.holidays;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_SETTINGS.enabled,
    dryRun: typeof value.dryRun === "boolean" ? value.dryRun : DEFAULT_SETTINGS.dryRun,
    holidays,
  };
}
