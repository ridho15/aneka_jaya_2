"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/ToastProvider";
import { AccountModal, type AccountRecord } from "./AccountModal";

type Props = {
  initialAccounts: AccountRecord[];
};

export function AccountManagerTable({ initialAccounts }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [accountToEdit, setAccountToEdit] = useState<AccountRecord | null>(null);
  const [isProcessingId, setIsProcessingId] = useState<string | null>(null);

  const categories = [
    { key: "ALL", label: "Semua Akun" },
    { key: "ASSET", label: "1 - ASET" },
    { key: "LIABILITY", label: "2 - LIABILITAS" },
    { key: "EQUITY", label: "3 - EKUITAS" },
    { key: "REVENUE", label: "4 - PENDAPATAN" },
    { key: "EXPENSE", label: "6 - BEBAN" },
  ];

  const filtered = useMemo(() => {
    return initialAccounts.filter((acc) => {
      if (selectedCategory !== "ALL" && acc.category !== selectedCategory) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return acc.code.toLowerCase().includes(q) || acc.name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [initialAccounts, selectedCategory, search]);

  const summary = useMemo(() => {
    let systemCount = 0;
    let customCount = 0;
    let activeCount = 0;

    initialAccounts.forEach((acc) => {
      if (acc.isSystem) systemCount++;
      else customCount++;
      if (acc.isActive) activeCount++;
    });

    return { total: initialAccounts.length, systemCount, customCount, activeCount };
  }, [initialAccounts]);

  const handleToggleActive = async (account: AccountRecord) => {
    if (account.isSystem && account.isActive) {
      showToast("Akun sistem bawaan tidak dapat dinonaktifkan.", "warning");
      return;
    }

    setIsProcessingId(account.id);
    try {
      const res = await fetch(`/api/accounting/accounts/${account.id}`, {
        method: account.isActive ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !account.isActive }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message || "Gagal mengubah status akun.", "error");
        return;
      }
      showToast(`Akun ${account.code} berhasil ${account.isActive ? "dinonaktifkan" : "diaktifkan kembali"}.`, "success");
      router.refresh();
    } catch {
      showToast("Terjadi kesalahan jaringan.", "error");
    } finally {
      setIsProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Akun Terdaftar</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900 font-mono tabular-nums">
            {summary.total} <span className="text-sm font-normal text-slate-500">Akun</span>
          </p>
          <p className="mt-3 text-xs text-slate-500">Struktur bagan akun standar & custom</p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Akun Aktif</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-emerald-800 font-mono tabular-nums">
            {summary.activeCount} <span className="text-sm font-normal text-slate-500">Akun</span>
          </p>
          <p className="mt-3 text-xs text-slate-500">Dapat dipilih pada transaksi jurnal</p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Akun Sistem Standar</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900 font-mono tabular-nums">
            {summary.systemCount} <span className="text-sm font-normal text-slate-500">Akun</span>
          </p>
          <p className="mt-3 text-xs text-slate-500">Terkunci untuk posting otomatis UKM</p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Akun Tambahan Custom</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-blue-800 font-mono tabular-nums">
            {summary.customCount} <span className="text-sm font-normal text-slate-500">Akun</span>
          </p>
          <p className="mt-3 text-xs text-slate-500">Dibuat khusus sesuai kebutuhan internal</p>
        </section>
      </div>

      {/* Main Table Container */}
      <section className="aj-surface overflow-hidden">
        {/* Category Tabs */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50/75 px-4 pt-3 gap-2">
          {categories.map((c) => (
            <button
              key={c.key}
              onClick={() => setSelectedCategory(c.key)}
              className={`px-3 py-2 text-xs font-semibold rounded-t-xs border-b-2 transition-colors whitespace-nowrap ${
                selectedCategory === c.key
                  ? "border-emerald-600 bg-white text-emerald-800"
                  : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Action Header */}
        <div className="border-b border-slate-100 p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white">
          <Input
            placeholder="Cari kode atau nama akun..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />

          <Button
            variant="primary"
            onClick={() => {
              setAccountToEdit(null);
              setIsModalOpen(true);
            }}
          >
            + Tambah Akun Baru
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 w-32">Kode Akun</th>
                <th className="py-3 px-4">Nama Akun & Deskripsi</th>
                <th className="py-3 px-4 w-36">Kategori</th>
                <th className="py-3 px-4 w-28 text-center">Saldo Normal</th>
                <th className="py-3 px-4 w-28 text-center">Tipe</th>
                <th className="py-3 px-4 w-24 text-center">Status</th>
                <th className="py-3 px-4 w-36 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    Tidak ada akun yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                filtered.map((acc) => (
                  <tr key={acc.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {acc.code}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{acc.name}</p>
                      {acc.description && (
                        <p className="text-[11px] text-slate-500 mt-0.5">{acc.description}</p>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-xs">
                        {acc.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-xs text-[11px] font-bold font-mono ${
                          acc.normalBalance === "DEBIT"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : "bg-blue-50 text-blue-800 border border-blue-200"
                        }`}
                      >
                        {acc.normalBalance}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {acc.isSystem ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-xs text-[10px] font-bold bg-slate-200 text-slate-800">
                          SISTEM
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-xs text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          KUSTOM
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center rounded-xs px-2 py-0.5 text-[11px] font-semibold ${
                          acc.isActive
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}
                      >
                        {acc.isActive ? "AKTIF" : "NONAKTIF"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          variant="secondary"
                          className="text-xs py-1 px-2.5 h-auto min-h-0"
                          onClick={() => {
                            setAccountToEdit(acc);
                            setIsModalOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        {!acc.isSystem && (
                          <button
                            type="button"
                            disabled={isProcessingId === acc.id}
                            onClick={() => handleToggleActive(acc)}
                            className={`text-[11px] font-semibold px-2 py-1 rounded-xs transition-colors ${
                              acc.isActive
                                ? "text-red-700 hover:bg-red-50"
                                : "text-emerald-700 hover:bg-emerald-50"
                            }`}
                          >
                            {isProcessingId === acc.id ? "..." : acc.isActive ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Account Modal */}
      <AccountModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        accountToEdit={accountToEdit}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </div>
  );
}
