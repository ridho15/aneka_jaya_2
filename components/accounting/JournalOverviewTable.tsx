"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatCurrency } from "@/lib/currency";
import { formatJakartaDate } from "@/lib/date/jakarta";
import { JournalDetailModal, type JournalDetailRow } from "./JournalDetailModal";
import { ManualJournalModal, type SimpleAccount } from "./ManualJournalModal";

type Props = {
  initialJournals: JournalDetailRow[];
  accounts: SimpleAccount[];
};

export function JournalOverviewTable({ initialJournals, accounts }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sourceTypeFilter, setSourceTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedJournal, setSelectedJournal] = useState<JournalDetailRow | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  const filtered = useMemo(() => {
    return initialJournals.filter((j) => {
      if (sourceTypeFilter !== "ALL" && j.sourceType !== sourceTypeFilter) return false;
      if (statusFilter !== "ALL" && j.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesNumber = j.entryNumber.toLowerCase().includes(q);
        const matchesDesc = j.description.toLowerCase().includes(q);
        const matchesRef = j.sourceRef ? j.sourceRef.toLowerCase().includes(q) : false;
        return matchesNumber || matchesDesc || matchesRef;
      }
      return true;
    });
  }, [initialJournals, sourceTypeFilter, statusFilter, search]);

  const summary = useMemo(() => {
    let totalValue = 0;
    let autoCount = 0;
    let reversedCount = 0;

    initialJournals.forEach((j) => {
      const entryDebit = j.lines.reduce((acc, l) => acc + Number(l.debit || 0), 0);
      if (j.status === "POSTED") {
        totalValue += entryDebit;
      } else {
        reversedCount++;
      }
      if (j.sourceType !== "MANUAL") {
        autoCount++;
      }
    });

    return {
      totalEntries: initialJournals.length,
      totalValue,
      autoCount,
      reversedCount,
    };
  }, [initialJournals]);

  const getSourceBadge = (type: string) => {
    switch (type) {
      case "EXPENSE":
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">Pengeluaran</span>;
      case "SDM_LOAN":
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">Kasbon / UM</span>;
      case "SDM_SETTLEMENT":
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">Realisasi UM</span>;
      case "SDM_SALARY":
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">Gaji SDM</span>;
      case "MANUAL":
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">Manual</span>;
      default:
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-slate-50 text-slate-600 border border-slate-200">{type}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Transaksi Jurnal</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900 font-mono tabular-nums">
            {summary.totalEntries} <span className="text-sm font-normal text-slate-500">Entri</span>
          </p>
          <p className="mt-3 text-xs text-slate-500">Seluruh ayat jurnal umum terdata</p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Nilai Terbukukan (Aktif)</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-emerald-800 font-mono tabular-nums">
            {formatCurrency(summary.totalValue)}
          </p>
          <p className="mt-3 text-xs text-slate-500">Akumulasi debit jurnal berstatus POSTED</p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Jurnal Otomatis Sistem</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900 font-mono tabular-nums">
            {summary.autoCount} <span className="text-sm font-normal text-slate-500">Entri</span>
          </p>
          <p className="mt-3 text-xs text-slate-500">Diposting langsung oleh modul operasional</p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Jurnal Dibalik (Reversed)</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-amber-700 font-mono tabular-nums">
            {summary.reversedCount} <span className="text-sm font-normal text-slate-500">Entri</span>
          </p>
          <p className="mt-3 text-xs text-slate-500">Jurnal yang dibatalkan / dinetralkan</p>
        </section>
      </div>

      {/* Main Table Container */}
      <section className="aj-surface overflow-hidden">
        <div className="border-b border-slate-100 p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white">
          <div className="flex flex-1 flex-wrap gap-3">
            <Input
              placeholder="Cari nomor jurnal, referensi, keterangan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
            <Select
              value={sourceTypeFilter}
              onChange={(e) => setSourceTypeFilter(e.target.value)}
              className="w-48"
            >
              <option value="ALL">Semua Sumber</option>
              <option value="EXPENSE">Pengeluaran / Beban</option>
              <option value="SDM_LOAN">Pencairan Kasbon / UM</option>
              <option value="SDM_SETTLEMENT">Realisasi Uang Muka</option>
              <option value="SDM_SALARY">Gaji Karyawan</option>
              <option value="MANUAL">Jurnal Manual</option>
            </Select>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-44"
            >
              <option value="ALL">Semua Status</option>
              <option value="POSTED">Terbukukan (POSTED)</option>
              <option value="REVERSED">Dibalik (REVERSED)</option>
            </Select>
          </div>

          <Button variant="primary" onClick={() => setIsManualModalOpen(true)}>
            + Input Jurnal Manual
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 w-36">No. Jurnal</th>
                <th className="py-3 px-4 w-28">Tanggal</th>
                <th className="py-3 px-4 w-32">Sumber</th>
                <th className="py-3 px-4 w-36">Referensi</th>
                <th className="py-3 px-4">Keterangan / Memo</th>
                <th className="py-3 px-4 w-36 text-right">Total Debit</th>
                <th className="py-3 px-4 w-36 text-right">Total Kredit</th>
                <th className="py-3 px-4 w-28 text-center">Status</th>
                <th className="py-3 px-4 w-24 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    Tidak ada transaksi jurnal yang sesuai dengan kriteria filter.
                  </td>
                </tr>
              ) : (
                filtered.map((j) => {
                  const entryDebit = j.lines.reduce((acc, l) => acc + Number(l.debit || 0), 0);
                  const entryCredit = j.lines.reduce((acc, l) => acc + Number(l.credit || 0), 0);

                  return (
                    <tr key={j.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {j.entryNumber}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {formatJakartaDate(j.entryDate)}
                      </td>
                      <td className="py-3 px-4">
                        {getSourceBadge(j.sourceType)}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {j.sourceRef || "-"}
                      </td>
                      <td className="py-3 px-4 text-slate-800">
                        {j.description}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatCurrency(entryDebit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatCurrency(entryCredit)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${
                            j.status === "POSTED"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-800 border border-amber-200"
                          }`}
                        >
                          {j.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Button
                          variant="secondary"
                          className="text-xs py-1 px-2.5 h-auto min-h-0"
                          onClick={() => setSelectedJournal(j)}
                        >
                          Rincian
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Detail Modal */}
      {selectedJournal && (
        <JournalDetailModal
          journal={selectedJournal}
          onClose={() => setSelectedJournal(null)}
          onJournalReversed={() => {
            router.refresh();
          }}
        />
      )}

      {/* Manual Journal Modal */}
      <ManualJournalModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        accounts={accounts}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </div>
  );
}
