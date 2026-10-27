"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/ToastProvider";

interface PurchaseInvoiceOption {
  id: string;
  invoiceNumber: string;
  supplierInvoiceNumber: string;
  supplier: { name: string; currency: string };
  currency: string;
  exchangeRate: number;
  totalAmountOriginal: number;
  totalPaidOriginal: number;
}

interface RekeningOption {
  id: string;
  name: string;
  bank: string;
  currency?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  invoices: PurchaseInvoiceOption[];
  rekenings: RekeningOption[];
  onSuccess: () => void;
}

export function PurchasePaymentModal({
  isOpen,
  onClose,
  invoices,
  rekenings,
  onSuccess
}: Props) {
  const { showToast } = useToast();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(invoices[0]?.id || "");
  const [rekeningAccountId, setRekeningAccountId] = useState(rekenings[0]?.id || "");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [amountPaidOriginal, setAmountPaidOriginal] = useState<number>(0);
  const [paymentRate, setPaymentRate] = useState<number>(16250);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeInvoice = invoices.find((i) => i.id === selectedInvoiceId);

  useEffect(() => {
    if (activeInvoice) {
      const remaining = Number(activeInvoice.totalAmountOriginal) - Number(activeInvoice.totalPaidOriginal);
      setAmountPaidOriginal(remaining > 0 ? remaining : 0);
      setPaymentRate(Number(activeInvoice.exchangeRate) || 16250);

      const invCurrency = (activeInvoice.currency || "IDR").toUpperCase();
      const currentRek = rekenings.find((r) => r.id === rekeningAccountId);
      const currentRekCurrency = (currentRek?.currency || "IDR").toUpperCase();

      const isCurrentCompatible =
        invCurrency === "IDR"
          ? currentRekCurrency === "IDR"
          : currentRekCurrency === invCurrency || currentRekCurrency === "IDR";

      if (!isCurrentCompatible) {
        const firstCompatible = rekenings.find((r) => {
          const c = (r.currency || "IDR").toUpperCase();
          return invCurrency === "IDR" ? c === "IDR" : c === invCurrency || c === "IDR";
        });
        if (firstCompatible) {
          setRekeningAccountId(firstCompatible.id);
        }
      }
    }
  }, [selectedInvoiceId, activeInvoice, rekenings, rekeningAccountId]);

  if (!isOpen) return null;

  const invoiceRate = Number(activeInvoice?.exchangeRate || 1);
  const settledPayableIdr = Math.round(amountPaidOriginal * invoiceRate);
  const totalPaidIdr = Math.round(amountPaidOriginal * paymentRate);
  const forexDiffIdr = settledPayableIdr - totalPaidIdr;
  const isForexGain = forexDiffIdr > 0;
  const isForexLoss = forexDiffIdr < 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!activeInvoice) {
      showToast("Pilih invoice pembelian yang akan dibayar.", "error");
      return;
    }

    const invCurrency = (activeInvoice.currency || "IDR").toUpperCase();
    const selectedRek = rekenings.find((r) => r.id === rekeningAccountId);
    const selectedRekCurrency = (selectedRek?.currency || "IDR").toUpperCase();

    if (invCurrency === "IDR" && selectedRekCurrency !== "IDR") {
      showToast(`Faktur IDR hanya dapat dibayar menggunakan rekening IDR. Rekening terpilih: ${selectedRekCurrency}`, "error");
      return;
    }

    if (invCurrency !== "IDR" && selectedRekCurrency !== invCurrency && selectedRekCurrency !== "IDR") {
      showToast(
        `Rekening ${selectedRek?.name || ""} (${selectedRekCurrency}) tidak dapat dipilih untuk tagihan ${invCurrency} tanpa konversi eksplisit. Gunakan rekening ${invCurrency} atau rekening IDR.`,
        "error"
      );
      return;
    }

    if (amountPaidOriginal <= 0) {
      showToast("Nominal pembayaran valas harus lebih dari 0.", "error");
      return;
    }
    if (paymentRate <= 0) {
      showToast("Kurs pembayaran harus lebih dari 0.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/purchasing/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseInvoiceId: activeInvoice.id,
          rekeningAccountId,
          paymentDate,
          amountPaidOriginal,
          paymentRate,
          notes: notes.trim() || undefined
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Gagal memproses pembayaran.");
      }

      showToast(`Pembayaran ${json.data.paymentNumber} berhasil dicatat & dijurnal.`, "success");
      onSuccess();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Terjadi kesalahan.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-sm border border-slate-200 bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Pembayaran Utang Valas Supplier</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Pelunasan faktur valuta asing dengan perhitungan otomatis selisih kurs (Forex Gain/Loss).
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Pilih Faktur Pembelian yang Akan Dibayar <span className="text-red-500">*</span>
            </label>
            <Select
              value={selectedInvoiceId}
              onChange={(e) => setSelectedInvoiceId(e.target.value)}
              required
            >
              {invoices.map((inv) => {
                const remaining = Number(inv.totalAmountOriginal) - Number(inv.totalPaidOriginal);
                return (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} (Vendor: {inv.supplierInvoiceNumber}) — {inv.supplier.name} — Sisa: {inv.currency} {remaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </option>
                );
              })}
            </Select>
          </div>

          {activeInvoice && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-sm font-mono text-xs grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <span className="text-slate-500 text-[10px] block">MATA UANG</span>
                <span className="font-bold text-amber-900">{activeInvoice.currency}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">KURS BUKU AWAL</span>
                <span className="font-bold">Rp {invoiceRate.toLocaleString("id-ID")}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">TOTAL TAGIHAN</span>
                <span>
                  {activeInvoice.currency}{" "}
                  {Number(activeInvoice.totalAmountOriginal).toLocaleString("en-US", {
                    minimumFractionDigits: 2
                  })}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">SISA UTANG</span>
                <span className="font-bold text-emerald-800">
                  {activeInvoice.currency}{" "}
                  {(
                    Number(activeInvoice.totalAmountOriginal) -
                    Number(activeInvoice.totalPaidOriginal)
                  ).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Tanggal Pembayaran
              </label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Rekening Sumber Pembayaran <span className="text-red-500">*</span>
              </label>
              <Select
                value={rekeningAccountId}
                onChange={(e) => setRekeningAccountId(e.target.value)}
                required
              >
                {rekenings.map((r) => {
                  const rCurrency = (r.currency || "IDR").toUpperCase();
                  const invCurrency = (activeInvoice?.currency || "IDR").toUpperCase();
                  const isCompatible =
                    invCurrency === "IDR"
                      ? rCurrency === "IDR"
                      : rCurrency === invCurrency || rCurrency === "IDR";

                  return (
                    <option key={r.id} value={r.id} disabled={!isCompatible}>
                      {r.name} ({r.bank} - {rCurrency}) {!isCompatible ? `— [Dilarang: valas silang ${rCurrency} vs ${invCurrency}]` : rCurrency === invCurrency && invCurrency !== "IDR" ? `— [Rekening Valas ${rCurrency}]` : `— [Rekening IDR]` }
                    </option>
                  );
                })}
              </Select>
              {(() => {
                const selectedRek = rekenings.find((r) => r.id === rekeningAccountId);
                const rekCur = (selectedRek?.currency || "IDR").toUpperCase();
                const invCur = (activeInvoice?.currency || "IDR").toUpperCase();
                if (rekCur === invCur && invCur !== "IDR") {
                  return (
                    <span className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                      Rekening Valas Sesuai ({invCur}): Pelunasan langsung dari saldo valuta asing.
                    </span>
                  );
                }
                if (rekCur === "IDR" && invCur !== "IDR") {
                  return (
                    <span className="mt-1.5 flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 px-2.5 py-1 rounded border border-blue-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                      Rekening IDR: Dana keluar dalam Rupiah dengan konversi kurs aktual bank.
                    </span>
                  );
                }
                if (rekCur !== invCur && rekCur !== "IDR") {
                  return (
                    <span className="mt-1.5 flex items-center gap-1.5 text-xs text-red-700 bg-red-50 px-2.5 py-1 rounded border border-red-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                      Tidak Kompatibel: Rekening {rekCur} dilarang untuk faktur {invCur} tanpa transaksi konversi eksplisit.
                    </span>
                  );
                }
                return null;
              })()}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Jumlah Valas Dibayar ({activeInvoice?.currency || "VALAS"}) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="any"
                min="0.01"
                value={amountPaidOriginal || ""}
                onChange={(e) => setAmountPaidOriginal(parseFloat(e.target.value) || 0)}
                className="font-mono text-sm font-bold text-amber-900"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Kurs Pembayaran Aktual (Rp/{activeInvoice?.currency || "VALAS"}) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="any"
                min="1"
                value={paymentRate || ""}
                onChange={(e) => setPaymentRate(parseFloat(e.target.value) || 1)}
                className="font-mono text-sm font-bold"
                required
              />
            </div>
          </div>

          {/* Real-time Forex Difference Live Card */}
          <div className="rounded-sm border border-slate-300 bg-slate-50 p-4 space-y-3 font-mono text-xs">
            <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px] font-sans">
              Pratinjau Selisih Kurs Terealisasi (Forex Gain / Loss)
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-700">
              <div>
                <span className="text-slate-500 block">Utang Buku Terhapus (Kurs Inv {invoiceRate}):</span>
                <span className="font-bold">Rp {settledPayableIdr.toLocaleString("id-ID")}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Kas Keluar Aktual (Kurs Bayar {paymentRate}):</span>
                <span className="font-bold">Rp {totalPaidIdr.toLocaleString("id-ID")}</span>
              </div>
            </div>

            <div
              className={`p-3 rounded border flex items-center justify-between font-sans ${
                isForexGain
                  ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                  : isForexLoss
                  ? "bg-rose-50 border-rose-300 text-rose-900"
                  : "bg-slate-100 border-slate-300 text-slate-700"
              }`}
            >
              <div>
                <span className="font-bold block text-sm">
                  {isForexGain
                    ? "✓ Keuntungan Selisih Kurs (Laba Kurs)"
                    : isForexLoss
                    ? "⚠ Kerugian Selisih Kurs (Rugi Kurs)"
                    : "Tidak Ada Selisih Kurs (Impas)"}
                </span>
                <span className="text-xs font-mono">
                  {isForexGain
                    ? "Kredit Akun: 4-1002 Pendapatan Selisih Kurs"
                    : isForexLoss
                    ? "Debit Akun: 6-1006 Kerugian Selisih Kurs"
                    : "Kurs pembayaran sama persis dengan kurs faktur"}
                </span>
              </div>
              <div className="font-mono text-base font-bold text-right">
                {isForexGain ? "+" : isForexLoss ? "-" : ""}
                Rp {Math.abs(forexDiffIdr).toLocaleString("id-ID")}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Catatan Pembayaran / No. Referensi Transfer TT Bank
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ref Telegraphic Transfer (TT) No: BCA-TT-20261026-X..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Memproses..." : "Konfirmasi Pembayaran & Jurnal"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
