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

export function PrintPreviewPage({
  kind,
  id,
  title,
  autoPrint = false,
}: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const printedRef = useRef(false);

  useEffect(() => {
    let active = true;

    loadPrintPreviewText(kind, id)
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
  }, [id, kind]);

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
  const paperSize = "12.5cm 14cm";
  const sheetSize = "w-[12.5cm] min-h-[14cm]";
  const pages = splitPrintPreviewPages(text);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-5 text-slate-950 sm:px-6 print:bg-white print:p-0">
      <style>{`
        @media print {
          html, body {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 12.5cm !important;
          }

          .print-actions {
            display: none !important;
          }
        
          @page {
            margin: 0 !important;
            size: ${paperSize};
          }

          .print-sheet {
            box-shadow: none !important;
            width: 12.5cm !important;
            height: 14cm !important;
            max-height: 14cm !important;
            margin: 0 !important;
            padding: 4.3cm 0.4cm 0 0.4cm !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: always;
            break-after: page;
          }

          .print-sheet:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        }
      `}</style>
      <div className="print-actions mb-5 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4">
        <button
          type="button"
          onClick={() => window.print()}
          disabled={loading || Boolean(error)}
          className="border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Print Browser
        </button>
        <button
          type="button"
          onClick={downloadText}
          disabled={loading || Boolean(error) || !text}
          className="border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Download .txt
        </button>
        <a
          href={printPreviewEndpoint(kind, id, "prn")}
          download={`${kind}-${id}.prn`}
          className={`border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 ${loading || error ? "pointer-events-none opacity-50" : ""}`}
        >
          Download .prn
        </a>
        <button
          type="button"
          onClick={() => history.back()}
          className="border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
        >
          Back
        </button>
        <Link
          href={printPreviewListPath(kind)}
          className="border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
        >
          Daftar
        </Link>
        <div className="ml-0 text-sm text-slate-600 sm:ml-3">
          <b className="text-slate-950">{title}</b>
          <span className="ml-2">{id}</span>
          <span className="ml-2 text-xs text-slate-500">
            .prn untuk raw dot matrix printer (12.5 x 14 cm)
          </span>
        </div>
      </div>

      {loading && <p className="font-mono text-sm">Memuat preview cetak...</p>}
      {error && (
        <div className="max-w-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <b className="block text-red-900">Preview tidak tersedia</b>
          <p className="mt-1">{error}</p>
        </div>
      )}
      {!loading && !error && (
        <div>
          {pages.map((page, index) => (
            <div
              key={index}
              className={`print-sheet bg-white shadow-sm ${sheetSize} max-w-full overflow-hidden px-[0.4cm] pb-[0.2cm] pt-[0.3cm] print:max-w-none print:overflow-hidden ${index < pages.length - 1 ? "print-page-break" : ""}`}
            >
              <pre className="m-0 whitespace-pre font-['Courier_New',Courier,monospace] text-[11px] font-semibold leading-[1.25] text-slate-950">
                {page}
              </pre>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
