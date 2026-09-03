"use client";

type PrintToolbarProps = {
  title: string;
  subtitle: string;
};

/**
 * Client Component toolbar untuk halaman pratinjau cetak.
 * Harus berupa "use client" karena menggunakan window.print() dan window.close().
 */
export function PrintToolbar({ title, subtitle }: PrintToolbarProps) {
  return (
    <div className="no-print mx-auto mb-6 flex max-w-5xl items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h1 className="font-bold text-slate-900">{title}</h1>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
        >
          Cetak / Simpan PDF
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Tutup
        </button>
      </div>
    </div>
  );
}
