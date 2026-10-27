"use client";

import React, { useMemo } from "react";
import type { ExpenseCategoryCode } from "@/lib/validation/pengeluaranSchema";
import { formatCurrency } from "@/lib/currency";

interface Props {
  categoryCode: ExpenseCategoryCode;
  amount: number;
  rekeningName?: string;
  employeeName?: string;
  vendorName?: string;
  salaryPeriod?: string;
  salaryPaymentType?: "EXPENSE" | "PAYABLE";
  purpose?: string;
  coaId?: string;
  coaNameSnapshot?: string;
}

export function ExpenseJournalPreview({
  categoryCode,
  amount,
  rekeningName,
  employeeName,
  vendorName,
  salaryPeriod,
  salaryPaymentType = "EXPENSE",
  purpose,
  coaId,
  coaNameSnapshot
}: Props) {
  const targetPerson = employeeName || vendorName || "Karyawan / Penerima";
  const safeAmount = Number(amount) > 0 ? Number(amount) : 0;
  const bankName = rekeningName || "Kas & Bank";

  const journalDetails = useMemo(() => {
    switch (categoryCode) {
      case "employee_loan":
        return {
          debitCode: "1-1003",
          debitName: "Piutang Karyawan",
          debitType: "Aset Lancar (Piutang)",
          memoDebit: `Pencairan Kasbon: ${targetPerson}${purpose ? ` - ${purpose}` : ""}`,
          note: "Kasbon dicatat sebagai Aset Piutang Karyawan dan TIDAK menambah beban operasional pada Laba Rugi."
        };
      case "operational_advance":
        return {
          debitCode: "1-1002",
          debitName: "Uang Muka Operasional",
          debitType: "Aset Lancar (Uang Muka)",
          memoDebit: `Pencairan Uang Muka: ${targetPerson}${purpose ? ` - ${purpose}` : ""}`,
          note: "Dicatat sebagai Uang Muka Operasional karyawan. Wajib dipertanggungjawabkan dengan nota riil pada menu SDM."
        };
      case "salary":
        if (salaryPaymentType === "PAYABLE") {
          return {
            debitCode: "2-1002",
            debitName: "Utang Gaji",
            debitType: "Kewajiban Lancar (Pelunasan)",
            memoDebit: `Pelunasan Utang Gaji: ${targetPerson} (${salaryPeriod || "Bulan Berjalan"})`,
            note: "Melunasi saldo Utang Gaji yang sebelumnya telah diakrualkan di pembukuan payroll. Tidak membebani laba rugi dua kali."
          };
        }
        return {
          debitCode: "6-1002",
          debitName: "Beban Gaji Karyawan",
          debitType: "Beban Operasional",
          memoDebit: `Beban Gaji: ${targetPerson} (${salaryPeriod || "Bulan Berjalan"})`,
          note: "Langsung diakui sebagai Beban Gaji pada periode berjalan."
        };
      case "goods_purchase":
        return {
          debitCode: "1-1005",
          debitName: "Persediaan Barang Dagang",
          debitType: "Aset (Persediaan)",
          memoDebit: `Pembelian persediaan / barang dari ${targetPerson}`,
          note: "Pembelian dicatat sebagai penambahan persediaan/utang, bukan beban operasional langsung."
        };
      default: {
        const customCode = coaId && /^[0-9]+-[0-9]+/.test(coaId) ? coaId : "6-1001";
        const customName = coaNameSnapshot || "Beban Operasional Umum";
        return {
          debitCode: customCode,
          debitName: customName,
          debitType: "Beban Operasional",
          memoDebit: `Beban operasional dibayarkan kepada ${targetPerson}`,
          note: "Diakui sebagai Beban Operasional yang mengurangi laba bersih periode berjalan."
        };
      }
    }
  }, [categoryCode, salaryPaymentType, targetPerson, purpose, salaryPeriod, coaId, coaNameSnapshot]);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 shadow-2xs space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-emerald-100 text-xs text-emerald-800 font-bold">
            ⚖
          </span>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Pratinjau Ayat Jurnal (Double-Entry Live Preview)
            </h4>
            <p className="text-[11px] text-slate-500">
              Simulasi jurnal akuntansi berpasangan yang akan dibukukan secara otomatis setelah disetujui
            </p>
          </div>
        </div>

        {safeAmount > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Seimbang (Balance)
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
            Menunggu nominal &gt; Rp 0
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-sans text-[11px]">
            <tr>
              <th className="py-2 px-3 w-16">Posisi</th>
              <th className="py-2 px-3 w-28">Kode Akun</th>
              <th className="py-2 px-3">Nama Akun & Memo</th>
              <th className="py-2 px-3 text-right w-36">Debit (Rp)</th>
              <th className="py-2 px-3 text-right w-36">Kredit (Rp)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {/* Baris Debit */}
            <tr className="hover:bg-slate-50/50">
              <td className="py-2.5 px-3">
                <span className="inline-block rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800 font-sans">
                  DEBIT
                </span>
              </td>
              <td className="py-2.5 px-3 font-semibold text-slate-900">{journalDetails.debitCode}</td>
              <td className="py-2.5 px-3">
                <div className="font-semibold text-slate-900">{journalDetails.debitName}</div>
                <div className="text-[11px] text-slate-500 font-sans">{journalDetails.memoDebit}</div>
              </td>
              <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                {safeAmount > 0 ? formatCurrency(safeAmount) : "-"}
              </td>
              <td className="py-2.5 px-3 text-right text-slate-400">Rp 0</td>
            </tr>

            {/* Baris Kredit */}
            <tr className="hover:bg-slate-50/50">
              <td className="py-2.5 px-3">
                <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 font-sans">
                  KREDIT
                </span>
              </td>
              <td className="py-2.5 px-3 font-semibold text-slate-900">1-1001</td>
              <td className="py-2.5 px-3">
                <div className="font-semibold text-slate-900">Kas & Bank ({bankName})</div>
                <div className="text-[11px] text-slate-500 font-sans">
                  Pencairan dana melalui rekening {bankName}
                </div>
              </td>
              <td className="py-2.5 px-3 text-right text-slate-400">Rp 0</td>
              <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                {safeAmount > 0 ? formatCurrency(safeAmount) : "-"}
              </td>
            </tr>
          </tbody>
          <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
            <tr>
              <td colSpan={3} className="py-2 px-3 text-right font-sans text-[11px] text-slate-600">
                TOTAL:
              </td>
              <td className="py-2 px-3 text-right text-slate-900">
                {safeAmount > 0 ? formatCurrency(safeAmount) : "Rp 0"}
              </td>
              <td className="py-2 px-3 text-right text-slate-900">
                {safeAmount > 0 ? formatCurrency(safeAmount) : "Rp 0"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[11px] text-slate-600 leading-relaxed font-sans flex items-start gap-1.5">
        <span className="text-emerald-700 font-bold">ℹ Catatan Akuntansi:</span>
        <span>{journalDetails.note}</span>
      </p>
    </div>
  );
}
