"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/ToastProvider";

export interface CurrencyRateItem {
  id: string;
  currency: string;
  rateDate: string;
  rateType: "BOOKING" | "BANK_ACTUAL" | "TAX_KMK";
  rate: number;
  source?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  initialRates: CurrencyRateItem[];
}

export function CurrencyRateManager({ initialRates }: Props) {
  const { showToast } = useToast();
  const [rates, setRates] = useState<CurrencyRateItem[]>(initialRates);
  const [filterCurrency, setFilterCurrency] = useState<string>("ALL");
  const [filterType, setFilterType] = useState<string>("ALL");

  // Form State
  const [currency, setCurrency] = useState("USD");
  const [rateDate, setRateDate] = useState(new Date().toISOString().split("T")[0]);
  const [rateType, setRateType] = useState<"BOOKING" | "BANK_ACTUAL" | "TAX_KMK">("BOOKING");
  const [rateValue, setRateValue] = useState("");
  const [source, setSource] = useState("BI");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredRates = rates.filter((r) => {
    if (filterCurrency !== "ALL" && r.currency !== filterCurrency) return false;
    if (filterType !== "ALL" && r.rateType !== filterType) return false;
    return true;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedRate = parseFloat(rateValue);
    if (isNaN(parsedRate) || parsedRate <= 0) {
      showToast("Nilai kurs harus lebih besar dari 0.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/accounting/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency,
          rateDate,
          rateType,
          rate: parsedRate,
          source: source.trim() || undefined,
          notes: notes.trim() || undefined
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Gagal menyimpan kurs.");
      }

      showToast(`Kurs ${currency} (${rateType}) berhasil disimpan.`, "success");
      setRateValue("");
      setNotes("");

      // Refresh list
      const fetchRes = await fetch("/api/accounting/rates");
      const fetchJson = await fetchRes.json();
      if (fetchJson.success) {
        setRates(fetchJson.data);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Terjadi kesalahan.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus catatan kurs ${name}?`)) return;

    try {
      const res = await fetch(`/api/accounting/rates?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Gagal menghapus kurs.");
      }
      setRates((prev) => prev.filter((r) => r.id !== id));
      showToast("Kurs berhasil dihapus.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menghapus kurs.", "error");
    }
  };

  const getRateTypeBadge = (type: string) => {
    switch (type) {
      case "BOOKING":
        return <span className="rounded-sm border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">Booking / Transaksi</span>;
      case "BANK_ACTUAL":
        return <span className="rounded-sm border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">Bank Aktual</span>;
      case "TAX_KMK":
        return <span className="rounded-sm border border-purple-300 bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-800">Pajak (KMK)</span>;
      default:
        return <span className="rounded-sm border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-800">{type}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Form Input Kurs Baru */}
      <section className="aj-surface p-5 sm:p-6">
        <h3 className="font-bold text-slate-900">Input / Perbarui Kurs Harian</h3>
        <p className="mt-1 text-xs text-slate-500">
          Masukkan kurs acuan mata uang asing (USD / RMB) untuk pembukuan pembelian, perhitungan pajak bea masuk (KMK), atau realisasi bank.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Tanggal Kurs
            </label>
            <Input
              type="date"
              value={rateDate}
              onChange={(e) => setRateDate(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Mata Uang
            </label>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD (US Dollar)</option>
              <option value="RMB">RMB / CNY (Yuan)</option>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Tipe Kurs
            </label>
            <Select
              value={rateType}
              onChange={(e) => setRateType(e.target.value as "BOOKING" | "BANK_ACTUAL" | "TAX_KMK")}
            >
              <option value="BOOKING">Booking (Transaksi)</option>
              <option value="BANK_ACTUAL">Bank Aktual</option>
              <option value="TAX_KMK">Pajak (KMK)</option>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Nilai Kurs (IDR)
            </label>
            <Input
              type="number"
              step="any"
              placeholder="e.g. 16250"
              value={rateValue}
              onChange={(e) => setRateValue(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Sumber Referensi
            </label>
            <Input
              placeholder="BCA / BI / KMK"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </div>

          <div className="flex items-end">
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Menyimpan..." : "Simpan Kurs"}
            </Button>
          </div>
        </form>
      </section>

      {/* Tabel Riwayat Kurs */}
      <section className="aj-surface">
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Riwayat Kurs Valas</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Menampilkan daftar kurs yang tersimpan untuk konversi transaksi dan audit pembukuan.
              </p>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={filterCurrency}
                onChange={(e) => setFilterCurrency(e.target.value)}
                className="text-xs"
              >
                <option value="ALL">Semua Mata Uang</option>
                <option value="USD">USD</option>
                <option value="RMB">RMB</option>
              </Select>

              <Select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="text-xs"
              >
                <option value="ALL">Semua Tipe Kurs</option>
                <option value="BOOKING">Booking (Transaksi)</option>
                <option value="BANK_ACTUAL">Bank Aktual</option>
                <option value="TAX_KMK">Pajak (KMK)</option>
              </Select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-semibold">
              <tr>
                <th className="px-5 py-3">Tanggal</th>
                <th className="px-5 py-3">Mata Uang</th>
                <th className="px-5 py-3">Tipe Kurs</th>
                <th className="px-5 py-3 text-right">Nilai Kurs (IDR)</th>
                <th className="px-5 py-3">Sumber</th>
                <th className="px-5 py-3">Catatan</th>
                <th className="px-5 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    Belum ada data kurs yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                filteredRates.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60 font-mono text-xs">
                    <td className="px-5 py-3 text-slate-800">
                      {new Date(r.rateDate).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-bold text-amber-900 bg-amber-50 border border-amber-300 rounded px-1.5 py-0.5">
                        {r.currency}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-sans">{getRateTypeBadge(r.rateType)}</td>
                    <td className="px-5 py-3 text-right font-bold text-slate-900">
                      Rp {r.rate.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    </td>
                    <td className="px-5 py-3 text-slate-600 font-sans">{r.source || "-"}</td>
                    <td className="px-5 py-3 text-slate-500 font-sans">{r.notes || "-"}</td>
                    <td className="px-5 py-3 text-center font-sans">
                      <button
                        onClick={() => handleDelete(r.id, `${r.currency} (${r.rateType})`)}
                        className="text-xs font-semibold text-red-600 hover:text-red-800"
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
