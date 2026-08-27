"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  loadPrintPreviewText,
  printPreviewEndpoint,
  printPreviewListPath,
  splitPrintPreviewPages,
  type PrintPreviewKind,
} from "@/lib/print/preview";

type Props = {
  kind: PrintPreviewKind;
  id: string;
  title: string;
  autoPrint?: boolean;
};

type PaperColor = "white" | "pink" | "yellow";

export interface PrintSettings {
  maxItemsSingle: number;
  maxItemsMulti: number;
  fontSize: string;
  lineHeight: string;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  maxItemsSingle: 14,
  maxItemsMulti: 18,
  fontSize: "13px",
  lineHeight: "1.15",
  paddingTop: "0.6cm",
  paddingRight: "0.3cm",
  paddingBottom: "0.2cm",
  paddingLeft: "1.3cm",
};

const STORAGE_KEY = "slm_print_settings_lx310";

export function ContinuousPaperPreview({
  kind,
  id,
  title,
  autoPrint = false,
}: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [itemLayout, setItemLayout] = useState<"single" | "double">("single");
  const [paperColor, setPaperColor] = useState<PaperColor>("white");
  const [showDriverHelp, setShowDriverHelp] = useState(false);
  const [showTuning, setShowTuning] = useState(false);
  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const printedRef = useRef(false);

  // Load custom settings from localStorage on initial client mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setSettings((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const updateSetting = <K extends keyof PrintSettings>(
    key: K,
    value: PrintSettings[K],
  ) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore localStorage errors
      }
      return next;
    });
  };

  const resetSettings = () => {
    setSettings(DEFAULT_PRINT_SETTINGS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore localStorage errors
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);

    loadPrintPreviewText(
      kind,
      id,
      fetch,
      itemLayout,
      settings.maxItemsSingle,
      settings.maxItemsMulti,
    )
      .then((preview) => {
        if (active) setText(preview);
      })
      .catch((err: Error) => {
        if (active) setError(err.message || "Preview cetak gagal dimuat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, kind, itemLayout, settings.maxItemsSingle, settings.maxItemsMulti]);

  useEffect(() => {
    if (!autoPrint || printedRef.current || loading || error || !text) return;
    printedRef.current = true;
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, [autoPrint, error, loading, text]);

  const downloadText = () => {
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${kind}-${id}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const pages = splitPrintPreviewPages(text);

  const paperBgClass = {
    white: "bg-white border-slate-300 text-slate-950",
    pink: "bg-[#fff0f4] border-rose-200 text-slate-950",
    yellow: "bg-[#fffde7] border-amber-200 text-slate-950",
  }[paperColor];

  const tractorHoleBgClass = {
    white: "bg-slate-200 border-slate-300 shadow-inner",
    pink: "bg-rose-100 border-rose-300 shadow-inner",
    yellow: "bg-amber-100 border-amber-300 shadow-inner",
  }[paperColor];

  const tractorSideBgClass = {
    white: "bg-slate-50/75 border-slate-200",
    pink: "bg-rose-50/75 border-rose-200",
    yellow: "bg-amber-50/75 border-amber-200",
  }[paperColor];

  const isCustomized =
    settings.maxItemsSingle !== DEFAULT_PRINT_SETTINGS.maxItemsSingle ||
    settings.maxItemsMulti !== DEFAULT_PRINT_SETTINGS.maxItemsMulti ||
    settings.fontSize !== DEFAULT_PRINT_SETTINGS.fontSize ||
    settings.lineHeight !== DEFAULT_PRINT_SETTINGS.lineHeight ||
    settings.paddingLeft !== DEFAULT_PRINT_SETTINGS.paddingLeft ||
    settings.paddingTop !== DEFAULT_PRINT_SETTINGS.paddingTop;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 print:bg-white print:p-0">
      <style>{`
        @media print {
          html, body {
            width: auto !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          .print-actions,
          .screen-only-element,
          .screen-tractor,
          .screen-perforation-divider {
            display: none !important;
          }

          @page {
            margin: 0 !important;
            size: 12cm 14cm;
          }

          .continuous-sheet-container {
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            border: none !important;
            display: block !important;
          }

          .screen-paper-frame {
            box-shadow: none !important;
            border: none !important;
            background: transparent !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 12cm !important;
            height: 14cm !important;
            display: block !important;
          }

          .print-page-break {
            page-break-after: always !important;
            break-after: page !important;
          }

          .continuous-sheet {
            box-shadow: none !important;
            border: none !important;
            background: transparent !important;
            width: 12cm !important;
            height: 14cm !important;
            max-height: 14cm !important;
            min-height: 14cm !important;
            margin: 0 !important;
            padding: ${settings.paddingTop} ${settings.paddingRight} ${settings.paddingBottom} ${settings.paddingLeft} !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .continuous-print-text,
          .continuous-sheet pre {
            font-size: ${settings.fontSize} !important;
            line-height: ${settings.lineHeight} !important;
            font-weight: 700 !important;
            color: #000 !important;
            margin: 0 !important;
          }
        }
      `}</style>

      {/* Toolbar Aksi (Konsisten dengan Desain Light SLM) */}
      <header className="print-actions mx-auto mb-6 max-w-5xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              disabled={loading || Boolean(error)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                />
              </svg>
              Print LX-310 (Browser)
            </button>

            {/* Toggle Format: 1 Baris vs 2 Baris */}
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
              <span className="px-1.5 text-xs font-semibold text-slate-600">
                Format:
              </span>
              <button
                type="button"
                onClick={() => setItemLayout("single")}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  itemLayout === "single"
                    ? "bg-white text-emerald-800 shadow-xs border border-emerald-300 ring-1 ring-emerald-400/50"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Format 1 Baris: 1 Item 1 Baris (Ringkas & Hemat Kertas)"
              >
                1 Baris (Ringkas)
              </button>
              <button
                type="button"
                onClick={() => setItemLayout("double")}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  itemLayout === "double"
                    ? "bg-white text-emerald-800 shadow-xs border border-emerald-300 ring-1 ring-emerald-400/50"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Format 2 Baris: Kode & Harga terpisah (Standar)"
              >
                2 Baris (Standar)
              </button>
            </div>

            {/* Tombol Buka Panel Tuning */}
            <button
              type="button"
              onClick={() => setShowTuning((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                showTuning
                  ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-400"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              ⚙️ Atur Layout Cetak
              {isCustomized && (
                <span
                  className="h-2 w-2 rounded-full bg-emerald-600"
                  title="Pengaturan kustom aktif"
                />
              )}
            </button>

            <button
              type="button"
              onClick={downloadText}
              disabled={loading || Boolean(error) || !text}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Download .txt
            </button>

            <a
              href={printPreviewEndpoint(
                kind,
                id,
                "prn",
                itemLayout,
                settings.maxItemsSingle,
                settings.maxItemsMulti,
              )}
              download={`${kind}-${id}.prn`}
              className={`rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 ${loading || error ? "pointer-events-none opacity-50" : ""}`}
            >
              Download .prn (Raw)
            </a>

            <button
              type="button"
              onClick={() => setShowDriverHelp((prev) => !prev)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              ℹ Panduan Driver
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Color Simulator Picker */}
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
              <span className="text-xs font-semibold text-slate-600">
                Simulasi Warna:
              </span>
              <button
                type="button"
                onClick={() => setPaperColor("white")}
                className={`h-5 w-5 rounded-md border text-[10px] font-bold transition ${paperColor === "white" ? "border-emerald-600 ring-2 ring-emerald-500/40" : "border-slate-300 opacity-70"}`}
                style={{ backgroundColor: "#ffffff" }}
                title="Kertas Putih (Lembar 1)"
              />
              <button
                type="button"
                onClick={() => setPaperColor("pink")}
                className={`h-5 w-5 rounded-md border text-[10px] font-bold transition ${paperColor === "pink" ? "border-emerald-600 ring-2 ring-emerald-500/40" : "border-rose-300 opacity-70"}`}
                style={{ backgroundColor: "#ffeef2" }}
                title="Kertas Pink (Rangkap)"
              />
              <button
                type="button"
                onClick={() => setPaperColor("yellow")}
                className={`h-5 w-5 rounded-md border text-[10px] font-bold transition ${paperColor === "yellow" ? "border-emerald-600 ring-2 ring-emerald-500/40" : "border-amber-300 opacity-70"}`}
                style={{ backgroundColor: "#fffde7" }}
                title="Kertas Kuning (Rangkap)"
              />
            </div>

            <button
              type="button"
              onClick={() => history.back()}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Kembali
            </button>
            <Link
              href={printPreviewListPath(kind)}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Daftar
            </Link>
          </div>
        </div>

        {/* Panel Live Tuning Kustomisasi Layout & Print */}
        {showTuning && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-slate-800 shadow-xs">
            <div className="flex flex-wrap items-center justify-between border-b border-emerald-200 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-emerald-950">
                  🎛️ Live Tuning & Kustomisasi Cetak (Real-Time)
                </span>
                <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                  Langsung Sinkron ke Hasil Print
                </span>
              </div>
              <button
                type="button"
                onClick={resetSettings}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 active:scale-95"
              >
                ↺ Reset ke Default
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Kontrol 1: Items per Page (Single / 1 Lembar) */}
              <div className="rounded-lg border border-emerald-200/80 bg-white p-3 shadow-2xs">
                <label className="block font-bold text-slate-900">
                  Max Items 1 Lembar:{" "}
                  <span className="text-emerald-700 font-mono text-sm font-extrabold">
                    {settings.maxItemsSingle}
                  </span>
                </label>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Kapasitas barang jika transaksi 1 lembar utuh (+ Total & TTD)
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="range"
                    min={10}
                    max={16}
                    step={1}
                    value={settings.maxItemsSingle}
                    onChange={(e) =>
                      updateSetting("maxItemsSingle", Number(e.target.value))
                    }
                    className="w-full accent-emerald-600"
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>10 item</span>
                  <span>14 (Default)</span>
                  <span>16 item</span>
                </div>
              </div>

              {/* Kontrol 2: Items per Page (Lembar 1 Multi-Halaman) */}
              <div className="rounded-lg border border-emerald-200/80 bg-white p-3 shadow-2xs">
                <label className="block font-bold text-slate-900">
                  Max Items Lembar 1:{" "}
                  <span className="text-emerald-700 font-mono text-sm font-extrabold">
                    {settings.maxItemsMulti}
                  </span>
                </label>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Kapasitas barang di lembar 1 jika transaksi multi-halaman
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="range"
                    min={14}
                    max={22}
                    step={1}
                    value={settings.maxItemsMulti}
                    onChange={(e) =>
                      updateSetting("maxItemsMulti", Number(e.target.value))
                    }
                    className="w-full accent-emerald-600"
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>14 item</span>
                  <span>18 (Default)</span>
                  <span>22 item</span>
                </div>
              </div>

              {/* Kontrol 3: Font Size & Leading */}
              <div className="rounded-lg border border-emerald-200/80 bg-white p-3 shadow-2xs">
                <label className="block font-bold text-slate-900">
                  Ukuran Huruf & Spasi:
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] font-semibold text-slate-500">
                      Font Size
                    </span>
                    <select
                      value={settings.fontSize}
                      onChange={(e) => updateSetting("fontSize", e.target.value)}
                      className="mt-0.5 w-full rounded-md border border-slate-300 bg-white p-1 text-xs font-semibold text-slate-800"
                    >
                      <option value="11px">11px (Kecil)</option>
                      <option value="12px">12px (Rapat)</option>
                      <option value="13px">13px (Default)</option>
                      <option value="13.5px">13.5px (Sedang)</option>
                      <option value="14px">14px (Besar)</option>
                      <option value="15px">15px (Ekstra)</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-slate-500">
                      Line Height
                    </span>
                    <select
                      value={settings.lineHeight}
                      onChange={(e) => updateSetting("lineHeight", e.target.value)}
                      className="mt-0.5 w-full rounded-md border border-slate-300 bg-white p-1 text-xs font-semibold text-slate-800"
                    >
                      <option value="1.05">1.05 (Sangat Rapat)</option>
                      <option value="1.12">1.12 (Rapat)</option>
                      <option value="1.15">1.15 (Default)</option>
                      <option value="1.25">1.25 (Longgar)</option>
                      <option value="1.5">1.50 (Lebar)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Kontrol 4: Margin / Padding Kiri (Geser Traktor Kiri) */}
              <div className="rounded-lg border border-emerald-200/80 bg-white p-3 shadow-2xs">
                <label className="block font-bold text-slate-900">
                  Padding Kiri (Traktor):{" "}
                  <span className="text-emerald-700 font-mono text-sm font-extrabold">
                    {settings.paddingLeft}
                  </span>
                </label>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Geser teks menjauhi lubang gerigi sebelah kiri
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    type="range"
                    min={0.6}
                    max={2.0}
                    step={0.1}
                    value={parseFloat(settings.paddingLeft) || 1.3}
                    onChange={(e) =>
                      updateSetting(
                        "paddingLeft",
                        `${parseFloat(e.target.value).toFixed(1)}cm`,
                      )
                    }
                    className="w-full accent-emerald-600"
                  />
                </div>
                <div className="mt-1 flex items-center gap-1">
                  {["0.8cm", "1.1cm", "1.3cm", "1.5cm"].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => updateSetting("paddingLeft", val)}
                      className={`flex-1 rounded border py-0.5 text-[10px] font-mono font-semibold transition ${
                        settings.paddingLeft === val
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Fine Padding Control Bar */}
            <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-emerald-200 pt-2.5 text-[11px]">
              <span className="font-bold text-slate-700">Padding Lainnya:</span>
              <div className="flex items-center gap-1">
                <span className="text-slate-500">Atas:</span>
                <select
                  value={settings.paddingTop}
                  onChange={(e) => updateSetting("paddingTop", e.target.value)}
                  className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-mono font-semibold"
                >
                  <option value="0.3cm">0.3cm</option>
                  <option value="0.5cm">0.5cm</option>
                  <option value="0.6cm">0.6cm (Default)</option>
                  <option value="0.8cm">0.8cm</option>
                  <option value="1.0cm">1.0cm</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-500">Kanan:</span>
                <select
                  value={settings.paddingRight}
                  onChange={(e) => updateSetting("paddingRight", e.target.value)}
                  className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-mono font-semibold"
                >
                  <option value="0.1cm">0.1cm</option>
                  <option value="0.2cm">0.2cm</option>
                  <option value="0.3cm">0.3cm (Default)</option>
                  <option value="0.5cm">0.5cm</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-500">Bawah:</span>
                <select
                  value={settings.paddingBottom}
                  onChange={(e) => updateSetting("paddingBottom", e.target.value)}
                  className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-mono font-semibold"
                >
                  <option value="0.1cm">0.1cm</option>
                  <option value="0.2cm">0.2cm (Default)</option>
                  <option value="0.4cm">0.4cm</option>
                  <option value="0.6cm">0.6cm</option>
                </select>
              </div>
              <span className="ml-auto text-[11px] italic text-emerald-800">
                ✨ Preferensi Anda otomatis tersimpan di browser ini.
              </span>
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
          <div>
            <span className="font-semibold text-slate-900">{title}:</span> {id}
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 font-mono font-semibold text-sky-800">
              Continuous Form: 12.0 cm × 14.0 cm
            </span>
            <span className="font-medium text-slate-600">
              Total Lembar: {pages.length} Halaman
            </span>
          </div>
        </div>

        {/* Info Panduan Driver & Script 1-Klik Epson LX-310 */}
        {showDriverHelp && (
          <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/80 p-4 text-xs text-sky-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-200 pb-3">
              <div>
                <p className="font-bold text-sky-950 text-sm">
                  ⚡ Setup Otomatis Ukuran Kertas (1-Klik untuk Petugas):
                </p>
                <p className="mt-0.5 text-slate-600">
                  Unduh file script di bawah ini lalu jalankan di komputer
                  petugas agar ukuran kertas <b>12 cm × 14 cm</b> otomatis
                  terdaftar di printer:
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="/scripts/setup_kertas_windows.bat"
                  download="setup_kertas_windows.bat"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white shadow-xs transition hover:bg-blue-700 active:scale-95"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  📥 Unduh Setup Windows (.bat)
                </a>

                <a
                  href="/scripts/setup_kertas_mac.zip"
                  download="setup_kertas_mac.zip"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-white shadow-xs transition hover:bg-slate-900 active:scale-95"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  📥 Unduh Setup Mac (.zip)
                </a>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="font-bold text-sky-950">
                  Cara Pakai di Windows (PC):
                </p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-slate-700">
                  <li>
                    Unduh file <b>setup_kertas_windows.bat</b>.
                  </li>
                  <li>
                    Klik kanan file &rarr; pilih <b>Run as administrator</b>.
                  </li>
                  <li>
                    Saat print di browser, pilih ukuran{" "}
                    <b>SLM Continuous 12x14</b>.
                  </li>
                </ol>
              </div>

              <div>
                <p className="font-bold text-sky-950">
                  Cara Pakai di Mac (MacBook):
                </p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-slate-700">
                  <li>
                    Unduh file <b>setup_kertas_mac.zip</b> lalu klik 2x untuk
                    ekstrak.
                  </li>
                  <li>
                    Klik 2x file <b>setup_kertas_mac.command</b> hasil ekstrak.
                  </li>
                  <li>
                    Ukuran kertas <b>SLM Continuous 12x14</b> otomatis aktif di
                    Mac.
                  </li>
                </ol>
              </div>
            </div>

            <div className="mt-3 border-t border-sky-200 pt-2 text-slate-600">
              <span className="font-semibold text-slate-900">
                Settingan Tambahan Dialog Print Browser:
              </span>{" "}
              Margins: <b>None</b> | Scale: <b>100%</b> | Headers & Footers:{" "}
              <b>Uncheck (Hilangkan centang)</b>.
            </div>
          </div>
        )}
      </header>

      {/* Konten Loading / Error */}
      {loading && (
        <div className="mx-auto max-w-md py-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-r-transparent"></div>
          <p className="mt-3 font-mono text-sm text-slate-600">
            Memuat preview continuous form...
          </p>
        </div>
      )}

      {error && (
        <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          <b className="block text-base font-bold text-red-900">
            Preview Tidak Tersedia
          </b>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {/* Simulasi Kertas Continuous Form di Layar (Clean Light Design) */}
      {!loading && !error && (
        <div className="continuous-sheet-container mx-auto flex flex-col items-center pb-12 print:p-0 print:m-0">
          {pages.map((page, index) => {
            const isLastPage = index === pages.length - 1;
            return (
              <div
                key={index}
                className={`flex flex-col items-center print:block ${index < pages.length - 1 ? "print-page-break" : ""}`}
              >
                {/* Header Indikator Halaman (Screen Only) */}
                <div className="screen-only-element mb-1.5 flex w-[14.8cm] items-center justify-between text-xs font-semibold text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-600"></span>
                    Lembar {index + 1} dari {pages.length}
                  </span>
                  <span className="font-mono text-slate-400">
                    12.0 cm × 14.0 cm
                  </span>
                </div>

                {/* Lembar Fisik Simulasi */}
                <div
                  className={`screen-paper-frame relative flex w-[14.8cm] rounded-sm border shadow-md transition-colors duration-200 ${paperBgClass}`}
                >
                  {/* Strip Traktor Kiri (Screen Only) */}
                  <div
                    className={`screen-tractor flex w-[1.4cm] shrink-0 flex-col items-center justify-between border-r border-dashed py-3 ${tractorSideBgClass}`}
                  >
                    {Array.from({ length: 11 }).map((_, holeIdx) => (
                      <div
                        key={`left-hole-${holeIdx}`}
                        className={`h-3 w-3 rounded-full border ${tractorHoleBgClass}`}
                        title="Tractor Pinfeed Hole"
                      />
                    ))}
                  </div>

                  {/* Area Badan Nota (Printable Area 12 cm x 14 cm) */}
                  <div
                    className="continuous-sheet relative w-[12.0cm] min-h-[14cm] max-h-[14cm] overflow-visible"
                    style={{
                      paddingTop: settings.paddingTop,
                      paddingRight: settings.paddingRight,
                      paddingBottom: settings.paddingBottom,
                      paddingLeft: settings.paddingLeft,
                    }}
                  >
                    <pre
                      className="continuous-print-text m-0 whitespace-pre font-['Courier_New',Courier,monospace] font-bold tracking-tight text-slate-950"
                      style={{
                        fontSize: settings.fontSize,
                        lineHeight: settings.lineHeight,
                      }}
                    >
                      {page}
                    </pre>
                  </div>

                  {/* Strip Traktor Kanan (Screen Only) */}
                  <div
                    className={`screen-tractor flex w-[1.4cm] shrink-0 flex-col items-center justify-between border-l border-dashed py-3 ${tractorSideBgClass}`}
                  >
                    {Array.from({ length: 11 }).map((_, holeIdx) => (
                      <div
                        key={`right-hole-${holeIdx}`}
                        className={`h-3 w-3 rounded-full border ${tractorHoleBgClass}`}
                        title="Tractor Pinfeed Hole"
                      />
                    ))}
                  </div>
                </div>

                {/* Garis Sobekan / Perforasi Antar Lembar (Screen Only) */}
                {!isLastPage && (
                  <div className="screen-perforation-divider my-4 flex w-[15.5cm] items-center justify-center">
                    <div className="flex-1 border-t-2 border-dashed border-slate-300"></div>
                    <span className="mx-3 inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 font-mono text-[11px] font-bold text-slate-600 shadow-xs">
                      ✂ Garis Potong / Perforasi Lembar ({index + 1} ➔{" "}
                      {index + 2})
                    </span>
                    <div className="flex-1 border-t-2 border-dashed border-slate-300"></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
