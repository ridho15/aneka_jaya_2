"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";

type Settings = { enabled: boolean; dryRun: boolean; holidays: string[] };
type Announcement = {
  id: string;
  slotKey: string;
  invoiceCount: number;
  invoices: { customerName: string; invoiceNumber: string | null }[];
  text: string;
  status: "played" | "dry_run" | "failed" | string;
  detail: string | null;
};
type Data = { settings: Settings; announcements: Announcement[]; lateNow: number; nextText: string | null };

const STATUS: Record<string, { label: string; className: string }> = {
  played: { label: "Diputar", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  dry_run: { label: "Mode uji", className: "bg-slate-100 text-slate-700 border-slate-200" },
  failed: { label: "Gagal", className: "bg-red-50 text-red-700 border-red-200" },
};

function slotLabel(slot: string) {
  const [day, hour] = slot.split(" ");
  const [y, m, d] = day.split("-");
  return `${d}-${m}-${y} ${hour}:00`;
}

export function CctvVoicePanel() {
  const { showToast } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [newHoliday, setNewHoliday] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/settings/packing-voice", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => {
        if (!alive) return;
        if (body.success) setData(body.data);
        else setError(body.message || "Gagal memuat.");
      })
      .catch(() => alive && setError("Gagal memuat pengingat suara."));
    return () => {
      alive = false;
    };
  }, []);

  async function save(next: Settings, done: string) {
    setBusy("save");
    try {
      const response = await fetch("/api/settings/packing-voice", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = await response.json();
      if (!body.success) throw new Error(body.message || "Gagal menyimpan.");
      setData((d) => (d ? { ...d, settings: body.data.settings } : d));
      showToast(done, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal menyimpan.", "error");
    } finally {
      setBusy("");
    }
  }

  async function listen(text?: string) {
    setBusy("preview");
    try {
      const response = await fetch("/api/settings/packing-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", text }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Suara tidak bisa dibuat.");
      }
      const url = URL.createObjectURL(await response.blob());
      audioRef.current?.pause();
      audioRef.current = new Audio(url);
      await audioRef.current.play();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Suara tidak bisa dibuat.", "error");
    } finally {
      setBusy("");
    }
  }

  async function testSpeaker() {
    setBusy("test");
    try {
      const response = await fetch("/api/settings/packing-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const body = await response.json();
      if (!body.success) throw new Error(body.message || "Uji gagal.");
      const r = body.data;
      showToast(r.played ? "Kalimat uji diputar di speaker kamera." : `Tidak diputar: ${r.reason || "mode uji"}`, r.played ? "success" : "info", 6000);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Uji gagal.", "error");
    } finally {
      setBusy("");
    }
  }

  if (error) return <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!data) return <p className="p-4 text-sm text-slate-500">Memuat pengingat suara…</p>;
  const { settings } = data;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="grid min-w-0 content-start gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">Pengingat suara packing</h2>
              <p className="mt-1 max-w-prose text-sm text-slate-600">
                Nota yang 1,5 jam setelah transaksi belum punya label QR tercatat CCTV diumumkan di speaker kamera packing. Tiap jam pukul 08:00–15:00, Senin–Sabtu, kecuali hari libur.
              </p>
            </div>
            <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${settings.enabled ? STATUS.played.className : STATUS.dry_run.className}`}>
              {settings.enabled ? (settings.dryRun ? "Aktif, mode uji" : "Aktif") : "Mati"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-700" checked={settings.enabled} disabled={busy === "save"}
                onChange={(e) => save({ ...settings, enabled: e.target.checked }, e.target.checked ? "Pengingat suara aktif." : "Pengingat suara dimatikan.")} />
              <span><b className="block text-slate-900">Aktif</b><span className="text-slate-600">Jalankan pengecekan tiap jam.</span></span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-700" checked={settings.dryRun} disabled={busy === "save"}
                onChange={(e) => save({ ...settings, dryRun: e.target.checked }, e.target.checked ? "Mode uji: tidak diputar di speaker." : "Pengumuman akan diputar di speaker.")} />
              <span><b className="block text-slate-900">Mode uji</b><span className="text-slate-600">Dicatat dan dikirim ke WhatsApp, tidak diputar.</span></span>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="text-base font-bold text-slate-900">Saat ini</h2>
          {data.nextText ? (
            <>
              <p className="mt-1 text-sm text-slate-600">{data.lateNow} nota belum tercatat dikemas lebih dari 1,5 jam. Pengumuman berikutnya:</p>
              <blockquote className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-800">{data.nextText}</blockquote>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-600">Tidak ada nota yang terlambat. Pengumuman berikutnya hanya diputar bila ada.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" disabled={!!busy} onClick={() => listen(data.nextText || undefined)}>
              {busy === "preview" ? "Membuat suara…" : "Dengarkan di sini"}
            </Button>
            <Button variant="secondary" disabled={!!busy} onClick={testSpeaker}>
              {busy === "test" ? "Mengirim…" : "Uji di speaker kamera"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Uji di speaker kamera memutar satu kalimat uji pendek, kecuali saat mode uji.</p>
        </section>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-xs">
          <h2 className="px-5 pt-5 text-base font-bold text-slate-900">Riwayat pengumuman</h2>
          {data.announcements.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-y border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr><th className="px-5 py-2">Jam</th><th className="px-5 py-2">Nota</th><th className="px-5 py-2">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.announcements.map((a) => {
                    const s = STATUS[a.status] ?? STATUS.dry_run;
                    return (
                      <tr key={a.id} className="align-top">
                        <td className="whitespace-nowrap px-5 py-3 tabular-nums text-slate-700">{slotLabel(a.slotKey)}</td>
                        <td className="px-5 py-3 text-slate-800">
                          <b>{a.invoiceCount} nota</b>
                          <span className="block text-xs text-slate-500">{a.invoices.slice(0, 4).map((i) => i.customerName).join(", ")}{a.invoices.length > 4 ? `, +${a.invoices.length - 4}` : ""}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${s.className}`}>{s.label}</span>
                          {a.detail && a.status === "failed" ? <span className="mt-1 block max-w-xs text-xs text-red-700">{a.detail}</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 pb-5 pt-1 text-sm text-slate-600">Belum ada pengumuman. Riwayat muncul setelah pengecekan pertama menemukan nota terlambat.</p>
          )}
        </section>
      </div>

      <section className="content-start rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <h2 className="text-base font-bold text-slate-900">Hari libur</h2>
        <p className="mt-1 text-sm text-slate-600">Tidak ada pengumuman di tanggal ini. Tambahkan libur bergerak dan cuti bersama tiap tahun.</p>
        <form className="mt-3 flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          if (!newHoliday || settings.holidays.includes(newHoliday)) return;
          save({ ...settings, holidays: [...settings.holidays, newHoliday].sort() }, "Hari libur ditambahkan.");
          setNewHoliday("");
        }}>
          <input type="date" value={newHoliday} onChange={(e) => setNewHoliday(e.target.value)} aria-label="Tanggal libur"
            className="min-h-9 min-w-0 flex-1 rounded-sm border border-neutral-300 px-2 text-sm" />
          <Button type="submit" disabled={!newHoliday || busy === "save"}>Tambah</Button>
        </form>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {settings.holidays.map((day) => (
            <li key={day} className="flex items-center justify-between gap-2 py-2">
              <span className="tabular-nums text-slate-800">{day.split("-").reverse().join("-")}</span>
              <button type="button" className="min-h-9 rounded-sm px-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                disabled={busy === "save"} aria-label={`Hapus libur ${day}`}
                onClick={() => save({ ...settings, holidays: settings.holidays.filter((d) => d !== day) }, "Hari libur dihapus.")}>Hapus</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
