"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { loadPrintPreviewText, type PrintPreviewKind } from "@/lib/print/preview";

type Props = {
  kind: PrintPreviewKind;
  id: string;
  title: string;
  autoPrint?: boolean;
};

export function PrintPreviewPage({ kind, id, title, autoPrint = false }: Props) {
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

  return (
    <main className="min-h-screen bg-white px-4 py-5 text-slate-950 sm:px-6 print:p-0">
      <style>{`
        @media print {
          body {
            background: #fff !important;
          }

          .print-actions {
            display: none !important;
          }

          @page {
            margin: 10mm;
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
          Print
        </button>
        <button
          type="button"
          onClick={() => history.back()}
          className="border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
        >
          Back
        </button>
        <Link
          href={kind === "sales" ? "/penjualan" : "/tempo"}
          className="border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
        >
          Daftar
        </Link>
        <div className="ml-0 text-sm text-slate-600 sm:ml-3">
          <b className="text-slate-950">{title}</b>
          <span className="ml-2">{id}</span>
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
        <pre className="m-0 w-[80ch] max-w-full overflow-x-auto whitespace-pre bg-white font-mono text-[12px] leading-tight text-slate-950 print:max-w-none print:overflow-visible">
          {text}
        </pre>
      )}
    </main>
  );
}
