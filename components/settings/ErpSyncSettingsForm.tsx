"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import type { ErpSyncSetting, MjTransactionMode } from "@/lib/settings/erpSync";

export function ErpSyncSettingsForm({ initialSetting }: { initialSetting: ErpSyncSetting }) {
  const [autoSyncAfterSalesEdit, setAutoSyncAfterSalesEdit] = useState(initialSetting.autoSyncAfterSalesEdit);
  const [erpTransactionSyncEnabled, setErpTransactionSyncEnabled] = useState(initialSetting.erpTransactionSyncEnabled);
  const [mjTransactionMode, setMjTransactionMode] = useState<MjTransactionMode>(initialSetting.mjTransactionMode);
  const [current, setCurrent] = useState(initialSetting);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string }>();

  const save = async () => {
    setSaving(true);
    const response = await fetch("/api/settings/erp-sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autoSyncAfterSalesEdit,
        erpTransactionSyncEnabled,
        mjTransactionMode,
      }),
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.success) {
      setCurrent(result.data);
      setAutoSyncAfterSalesEdit(result.data.autoSyncAfterSalesEdit);
      setErpTransactionSyncEnabled(result.data.erpTransactionSyncEnabled);
      setMjTransactionMode(result.data.mjTransactionMode);
      setNotice({ type: "success", message: "Konfigurasi ERP Sync & Mode Transaksi berhasil disimpan." });
    } else {
      setNotice({ type: "error", message: result?.message || "Setting ERP Sync gagal disimpan." });
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {notice && <Toast {...notice} />}

      {/* Mode Status Banner */}
      <div
        className={`rounded-xl border p-4.5 ${
          erpTransactionSyncEnabled
            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
            : "border-slate-200 bg-slate-50 text-slate-800"
        }`}
      >
        <div className="flex items-start gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider">
              {erpTransactionSyncEnabled
                ? "Mode Full Integration (Stok & Transaksi Terhubung)"
                : "Mode Stok Saja / Stock-Only Mode (Aktif)"}
            </h3>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              {erpTransactionSyncEnabled
                ? "Seluruh transaksi penjualan & pengeluaran akan disinkronkan ke Aneka Jaya ERP. Stok barang diambil langsung dari ERP."
                : "Hanya data stok gudang & master produk yang terhubung ke Aneka Jaya ERP. Seluruh transaksi penjualan, pengeluaran, dan pembayaran di SLM disimpan murni lokal di database SLM tanpa mengirim invoice/pembayaran ke ERP."}
            </p>
          </div>
        </div>
      </div>

      {/* Bagian 1: Koneksi Transaksi Aneka Jaya ERP */}
      <section className="aj-surface p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">
          Sinkronisasi Aneka Jaya ERP
        </p>
        <h3 className="mt-1 text-lg font-bold text-slate-900">
          Koneksi Transaksi ke Aneka Jaya ERP
        </h3>
        <p className="mt-1 text-xs text-slate-600 sm:text-sm">
          Tentukan apakah transaksi penjualan dan pengeluaran SLM dikirim ke Aneka Jaya ERP.
        </p>

        <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 cursor-pointer hover:bg-slate-50 transition">
          <input
            className="mt-1 h-4 w-4 text-emerald-600 focus:ring-emerald-500 rounded"
            type="checkbox"
            checked={erpTransactionSyncEnabled}
            onChange={(event) => setErpTransactionSyncEnabled(event.target.checked)}
          />
          <span className="select-none">
            <span className="block text-sm font-bold text-slate-800">
              Aktifkan Sinkronisasi Transaksi ke Aneka Jaya ERP
            </span>
            <span className="mt-1 block text-xs text-slate-500">
              Status saat ini:{" "}
              <b className={current.erpTransactionSyncEnabled ? "text-emerald-700" : "text-slate-600"}>
                {current.erpTransactionSyncEnabled ? "Aktif (Full Sync)" : "Nonaktif (Mode Stok Saja)"}
              </b>
            </span>
          </span>
        </label>
      </section>

      {/* Bagian 2: Integrasi Inbound Sistem MJ */}
      <section className="aj-surface p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">
          Integrasi Inbound
        </p>
        <h3 className="mt-1 text-lg font-bold text-slate-900">
          Mode Transaksi dari Sistem MJ
        </h3>
        <p className="mt-1 text-xs text-slate-600 sm:text-sm">
          Atur bagaimana SLM merespons transaksi penjualan/invoice masuk dari sistem MJ.
        </p>

        <div className="mt-4 space-y-2.5">
          <label className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition ${
            mjTransactionMode === "disabled" ? "border-rose-300 bg-rose-50/50" : "border-slate-200 bg-white hover:bg-slate-50"
          }`}>
            <input
              type="radio"
              name="mjMode"
              value="disabled"
              checked={mjTransactionMode === "disabled"}
              onChange={() => setMjTransactionMode("disabled")}
              className="mt-1 text-rose-600 focus:ring-rose-500"
            />
            <div>
              <span className="block text-sm font-bold text-slate-900">
                Dinonaktifkan (Tolak Transaksi Masuk)
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">
                SLM akan menolak seluruh request pembuatan transaksi baru dari MJ dengan error 503 (Service Unavailable).
              </span>
            </div>
          </label>

          <label className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition ${
            mjTransactionMode === "record_only" ? "border-amber-300 bg-amber-50/50" : "border-slate-200 bg-white hover:bg-slate-50"
          }`}>
            <input
              type="radio"
              name="mjMode"
              value="record_only"
              checked={mjTransactionMode === "record_only"}
              onChange={() => setMjTransactionMode("record_only")}
              className="mt-1 text-amber-600 focus:ring-amber-500"
            />
            <div>
              <span className="block text-sm font-bold text-slate-900">
                Catat Lokal Saja (Record Only)
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">
                Transaksi dari MJ tetap diterima dan disimpan di database SLM, namun <b>tidak diproses</b> ke Aneka Jaya ERP.
              </span>
            </div>
          </label>

          <label className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition ${
            mjTransactionMode === "process_aj" ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200 bg-white hover:bg-slate-50"
          }`}>
            <input
              type="radio"
              name="mjMode"
              value="process_aj"
              checked={mjTransactionMode === "process_aj"}
              onChange={() => setMjTransactionMode("process_aj")}
              className="mt-1 text-emerald-600 focus:ring-emerald-500"
            />
            <div>
              <span className="block text-sm font-bold text-slate-900">
                Proses Penuh ke Aneka Jaya ERP (Process AJ)
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">
                Transaksi dari MJ diproses otomatis untuk membuat invoice, pembayaran, dan release stok di Aneka Jaya ERP (memerlukan sinkronisasi transaksi aktif).
              </span>
            </div>
          </label>
        </div>
      </section>

      {/* Bagian 3: Auto Sync Setelah Edit */}
      <section className="aj-surface p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">
          Otomasi Edit
        </p>
        <h3 className="mt-1 text-lg font-bold text-slate-900">
          Auto Sync Setelah Edit Penjualan ERP
        </h3>
        <p className="mt-1 text-xs text-slate-600 sm:text-sm">
          Jika aktif, transaksi penjualan ERP yang diedit akan langsung dicoba sinkron ulang otomatis.
        </p>

        <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 cursor-pointer hover:bg-slate-50 transition">
          <input
            className="mt-1 h-4 w-4 text-emerald-600 focus:ring-emerald-500 rounded"
            type="checkbox"
            checked={autoSyncAfterSalesEdit}
            onChange={(event) => setAutoSyncAfterSalesEdit(event.target.checked)}
          />
          <span className="select-none">
            <span className="block text-sm font-bold text-slate-800">
              Aktifkan auto sync setelah edit
            </span>
            <span className="mt-1 block text-xs text-slate-500">
              Status saat ini: {current.autoSyncAfterSalesEdit ? "Aktif" : "Manual"}
            </span>
          </span>
        </label>
      </section>

      {/* Tombol Simpan */}
      <div>
        <Button
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-sm"
        >
          {saving ? "Menyimpan..." : "Simpan Konfigurasi Integrasi"}
        </Button>
      </div>
    </div>
  );
}
