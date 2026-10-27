"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatCurrency } from "@/lib/currency";
import type { EmployeeLoanOverviewRow } from "@/lib/sdm/loanStore";

type Props = {
  overview: EmployeeLoanOverviewRow[];
};

export function KasbonOverviewTable({ overview }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "settled">("active");

  const filtered = useMemo(() => {
    return overview.filter((item) => {
      if (statusFilter === "active" && item.openBalance <= 0) return false;
      if (statusFilter === "settled" && item.openBalance > 0) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.position.toLowerCase().includes(q) ||
          item.department.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [overview, statusFilter, search]);

  const summary = useMemo(() => {
    let totalDisbursed = 0;
    let totalRepaid = 0;
    let totalOpen = 0;
    let activeBorrowers = 0;

    overview.forEach((item) => {
      totalDisbursed += item.totalLoans;
      totalRepaid += item.totalRepaid;
      totalOpen += item.openBalance;
      if (item.openBalance > 0) activeBorrowers++;
    });

    return { totalDisbursed, totalRepaid, totalOpen, activeBorrowers };
  }, [overview]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Kasbon Dicairkan</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{formatCurrency(summary.totalDisbursed)}</p>
          <p className="mt-3 text-xs text-slate-500">Akumulasi pencairan kasbon disetujui</p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Pelunasan Diterima</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-emerald-700">{formatCurrency(summary.totalRepaid)}</p>
          <p className="mt-3 text-xs text-slate-500">Melalui transfer, tunai, atau potong gaji</p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Saldo Piutang Terbuka (Aset)</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-amber-700">{formatCurrency(summary.totalOpen)}</p>
          <p className="mt-3 text-xs text-slate-500">Piutang kasbon yang belum lunas</p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Karyawan Berkasbon Aktif</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{summary.activeBorrowers} Karyawan</p>
          <p className="mt-3 text-xs text-slate-500">Dari total {overview.length} karyawan terdata</p>
        </section>
      </div>

      <section className="aj-surface overflow-hidden">
        <div className="border-b border-slate-100 p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white">
          <div className="flex flex-1 flex-wrap gap-3">
            <Input
              placeholder="Cari karyawan, jabatan, departemen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "settled")}
              className="w-48"
            >
              <option value="active">Sisa Kasbon &gt; 0 (Aktif)</option>
              <option value="settled">Lunas (Sisa 0)</option>
              <option value="all">Semua Riwayat</option>
            </Select>
          </div>

          <Link
            href="/pengeluaran/input"
            className="inline-flex items-center justify-center rounded border border-emerald-600 bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-2xs"
          >
            + Input Kasbon Baru
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Nama Karyawan</th>
                <th className="px-5 py-3">Departemen & Jabatan</th>
                <th className="px-5 py-3 text-right">Total Kasbon</th>
                <th className="px-5 py-3 text-right">Total Dilunasi</th>
                <th className="px-5 py-3 text-right">Sisa Piutang (Saldo)</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                    Tidak ada data kasbon karyawan yang sesuai kriteria.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.employeeId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{item.name}</div>
                      <div className="text-xs text-slate-500">{item.loanCount} transaksi kasbon tercatat</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-800">{item.position}</div>
                      <div className="text-xs text-slate-500">{item.department}</div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-900">
                      {formatCurrency(item.totalLoans)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono tabular-nums text-emerald-700">
                      {formatCurrency(item.totalRepaid)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono tabular-nums font-bold text-amber-700">
                      {formatCurrency(item.openBalance)}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          item.openBalance > 0
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {item.openBalance > 0 ? "Belum Lunas" : "Lunas"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/sdm/kasbon/${item.employeeId}`}
                        className="inline-flex items-center rounded border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-emerald-700 transition"
                      >
                        Buku Pembantu →
                      </Link>
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
