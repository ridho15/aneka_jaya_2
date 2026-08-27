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
  const printedRef = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);

    loadPrintPreviewText(kind, id, fetch, itemLayout)
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
  }, [id, kind, itemLayout]);

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

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 print:bg-white print:p-0">
      <style>{`
        @media print {
          html, body {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 12cm !important;
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
            padding: 0.6cm 0.3cm 0.2cm 1.3cm !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .continuous-print-text {
            font-size: 13px !important;
            line-height: 1.12 !important;
            font-weight: 700 !important;
            color: #000 !important;
            margin: 0 !important;
          }

          .print-sheet pre,
          .continuous-sheet pre {
            font-size: 13px !important;  /* atau 10.5px / 11.5px sesuai keinginan */
            line-height: 1.15 !important;
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
            </div>

            <button
              type="button"
              onClick={downloadText}
              disabled={loading || Boolean(error) || !text}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Download .txt
            </button>

            <a
              href={printPreviewEndpoint(kind, id, "prn", itemLayout)}
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
                  <div className="continuous-sheet relative w-[12.0cm] min-h-[14cm] max-h-[14cm] overflow-visible pl-[0.8cm] pt-[0.6cm] pr-[0.3cm] pb-[0.2cm]">
                    <pre className="continuous-print-text m-0 whitespace-pre font-['Courier_New',Courier,monospace] text-[13.5px] font-bold leading-[1.12] tracking-tight text-slate-950">
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
