import { describe, expect, it } from "vitest";
import {
  announcementText,
  currentSlot,
  DEFAULT_SETTINGS,
  isLate,
  normalizeSettings,
  whatsappText,
  type LateCandidate,
} from "@/lib/cctv/packingVoiceRules";

const at = (wibTime: string) => new Date(`${wibTime}+07:00`);
const sale = (name: string, time = "2026-11-06T09:00:00", invoice: string | null = null): LateCandidate => ({ id: name, customerName: name, invoiceNumber: invoice, at: at(time) });

describe("pengingat suara packing: kapan", () => {
  it("terlambat tepat 1,5 jam setelah transaksi", () => {
    expect(isLate(at("2026-11-06T09:00:00"), at("2026-11-06T10:29:59"))).toBe(false);
    expect(isLate(at("2026-11-06T09:00:00"), at("2026-11-06T10:30:00"))).toBe(true);
  });

  it("tiap jam 08:00 sampai 15:00 WIB, tidak sesudahnya", () => {
    expect(currentSlot(at("2026-11-06T07:59:00"), [])).toEqual({ skip: "belum jam kerja" });
    expect(currentSlot(at("2026-11-06T08:00:00"), [])).toEqual({ slot: "2026-11-06 08" });
    expect(currentSlot(at("2026-11-06T14:05:00"), [])).toEqual({ slot: "2026-11-06 14" });
    expect(currentSlot(at("2026-11-06T15:02:00"), [])).toEqual({ slot: "2026-11-06 15" });
    expect(currentSlot(at("2026-11-06T15:30:00"), [])).toEqual({ skip: "lewat pukul 15:00" });
    expect(currentSlot(at("2026-11-06T16:00:00"), [])).toEqual({ skip: "lewat pukul 15:00" });
    expect(currentSlot(at("2026-11-06T10:45:00"), [])).toEqual({ skip: "bukan awal jam" });
  });

  it("bukan hari Minggu dan bukan hari libur", () => {
    expect(currentSlot(at("2026-11-08T10:00:00"), [])).toEqual({ skip: "Minggu" });
    expect(currentSlot(at("2026-11-07T10:00:00"), [])).toEqual({ slot: "2026-11-07 10" }); // Sabtu
    expect(currentSlot(at("2026-08-17T10:00:00"), DEFAULT_SETTINGS.holidays)).toEqual({ skip: "hari libur" });
  });

  it("memakai jam WIB walau server berjalan di UTC", () => {
    expect(currentSlot(new Date("2026-11-06T03:00:00Z"), [])).toEqual({ slot: "2026-11-06 10" });
  });
});

describe("pengingat suara packing: kalimat", () => {
  it("mengikuti contoh pemilik", () => {
    expect(announcementText([sale("Toko Hansel"), sale("Toko Sinar")])).toBe(
      "Perhatian tim packing. Ada 2 nota belum diproses. Toko Hansel, Toko Sinar. Segera diproses. Terima kasih.");
  });

  it("paling banyak tiga nama, sisanya dihitung; nama yang sama disebut sekali", () => {
    const text = announcementText([sale("A"), sale("B"), sale("A"), sale("C"), sale("D"), sale("E")]);
    expect(text).toBe("Perhatian tim packing. Ada 6 nota belum diproses. A, B, C, dan 2 lainnya. Segera diproses. Terima kasih.");
  });

  it("ringkasan WhatsApp menyebut jam, nota, dan hasil suara", () => {
    const text = whatsappText("2026-11-06 14", [sale("Toko Hansel", undefined, "061026-23")], "mode uji, tidak diputar");
    expect(text).toContain("*Pengingat packing 14:00 WIB*");
    expect(text).toContain("- Toko Hansel (061026-23)");
    expect(text).toContain("Suara: mode uji, tidak diputar");
  });
});

describe("pengingat suara packing: pengaturan", () => {
  it("mati dan mode uji bila belum diatur", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_SETTINGS.dryRun).toBe(true);
  });

  it("hanya menyimpan tanggal yang sah, tanpa duplikat, berurutan", () => {
    expect(normalizeSettings({ enabled: true, dryRun: false, holidays: ["2026-12-25", "bukan", "2026-03-20", "2026-12-25"] }))
      .toEqual({ enabled: true, dryRun: false, holidays: ["2026-03-20", "2026-12-25"] });
  });
});
