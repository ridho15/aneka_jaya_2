"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatCurrency } from "@/lib/currency";
import { jakartaDateKey } from "@/lib/date/jakarta";
import { SavingsDepositModal, type EmployeeOption, type RekeningOption } from "./SavingsDepositModal";
import { SavingsWithdrawalModal, type SavingsAccountOption } from "./SavingsWithdrawalModal";

type SavingsAccountItem = {
  id: string;
  accountNumber: string;
  balance: any;
  isActive: boolean;
  notes: string | null;
  employee: {
    id: string;
    nik: string | null;
    name: string;
    department: string;
    position: string;
    isActive: boolean;
  };
  _count: {
    transactions: number;
  };
};

type SavingsTransactionItem = {
  id: string;
  transactionDate: Date | string;
  type: string;
  source: string;
  amount: any;
  balanceAfter: any;
  notes: string | null;
  savingsAccount: {
    employee: {
      id: string;
      name: string;
      nik: string | null;
      department: string;
    };
  };
  rekeningAccount: {
    id: string;
    name: string;
    bankName: string | null;
  } | null;
  journalEntry: {
    id: string;
    journalNumber: string;
    status: string;
  } | null;
};

type SavingsSummary = {
  totalEmployeesWithSavings: number;
  totalBalance: number;
  totalDeposits: number;
  depositCount: number;
  totalWithdrawals: number;
  withdrawalCount: number;
};

type Props = {
  initialAccounts: SavingsAccountItem[];
  initialSummary: SavingsSummary;
  initialTransactions: SavingsTransactionItem[];
  employees: EmployeeOption[];
  rekenings: RekeningOption[];
};

export function SavingsManager({
  initialAccounts,
  initialSummary,
  initialTransactions,
  employees,
  rekenings
}: Props) {
  const [accounts, setAccounts] = useState<SavingsAccountItem[]>(initialAccounts);
  const [summary, setSummary] = useState<SavingsSummary>(initialSummary);
  const [transactions, setTransactions] = useState<SavingsTransactionItem[]>(initialTransactions);

  const [activeTab, setActiveTab] = useState<"accounts" | "transactions">("accounts");
  const [keyword, setKeyword] = useState("");
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [isWithdrawalOpen, setIsWithdrawalOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>();
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();

  const refreshData = async () => {
    try {
      const [accRes, trxRes] = await Promise.all([
        fetch("/api/sdm/savings"),
        fetch("/api/sdm/savings/transactions?limit=50")
      ]);
      const accJson = await accRes.json();
      const trxJson = await trxRes.json();

      if (accJson.success) {
        setAccounts(accJson.data.accounts);
        setSummary(accJson.data.summary);
      }
      if (trxJson.success) {
        setTransactions(trxJson.data);
      }
    } catch (e) {
      console.error("Gagal memperbarui data simpanan:", e);
    }
  };

  const filteredAccounts = accounts.filter((acc) => {
    if (!keyword.trim()) return true;
    const q = keyword.toLowerCase();
    return (
      acc.accountNumber.toLowerCase().includes(q) ||
      acc.employee.name.toLowerCase().includes(q) ||
      (acc.employee.nik && acc.employee.nik.toLowerCase().includes(q)) ||
      acc.employee.department.toLowerCase().includes(q)
    );
  });

  const filteredTransactions = transactions.filter((trx) => {
    if (!keyword.trim()) return true;
    const q = keyword.toLowerCase();
    return (
      trx.savingsAccount.employee.name.toLowerCase().includes(q) ||
      (trx.savingsAccount.employee.nik && trx.savingsAccount.employee.nik.toLowerCase().includes(q)) ||
      trx.type.toLowerCase().includes(q) ||
      (trx.notes && trx.notes.toLowerCase().includes(q))
    );
  });

  // Account options for withdrawal modal
  const accountOptions: SavingsAccountOption[] = accounts
    .filter((a) => a.isActive && Number(a.balance) > 0)
    .map((a) => ({
      id: a.id,
      accountNumber: a.accountNumber,
      balance: Number(a.balance),
      employee: {
        id: a.employee.id,
        name: a.employee.name,
        nik: a.employee.nik,
        department: a.employee.department
      }
    }));

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("accounts")}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition ${
              activeTab === "accounts"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Rekening Simpanan ({accounts.length})
          </button>
          <button
            onClick={() => setActiveTab("transactions")}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition ${
              activeTab === "transactions"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Riwayat Mutasi ({transactions.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setSelectedEmployeeId(undefined);
              setIsDepositOpen(true);
            }}
            className="text-xs"
          >
            + Setor Simpanan
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setSelectedAccountId(undefined);
              setIsWithdrawalOpen(true);
            }}
            disabled={accountOptions.length === 0}
            className="text-xs"
          >
            − Tarik Simpanan
          </Button>
        </div>
      </div>

      {/* 4 Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="aj-surface p-4 border border-slate-200">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Total Saldo Tersimpan
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-700 tabular-nums">
            {formatCurrency(summary.totalBalance)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Kewajiban internal perusahaan (COA 2-1003)</p>
        </div>

        <div className="aj-surface p-4 border border-slate-200">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Karyawan Penabung
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {summary.totalEmployeesWithSavings}
          </p>
          <p className="mt-1 text-xs text-slate-500">Akun tabungan terdaftar aktif</p>
        </div>

        <div className="aj-surface p-4 border border-slate-200">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Akumulasi Setoran
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-blue-700 tabular-nums">
            {formatCurrency(summary.totalDeposits)}
          </p>
          <p className="mt-1 text-xs text-slate-500">{summary.depositCount} kali penyetoran</p>
        </div>

        <div className="aj-surface p-4 border border-slate-200">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Akumulasi Penarikan
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-rose-600 tabular-nums">
            {formatCurrency(summary.totalWithdrawals)}
          </p>
          <p className="mt-1 text-xs text-slate-500">{summary.withdrawalCount} kali pencairan</p>
        </div>
      </div>

      {/* Filter search bar */}
      <div className="aj-surface p-3 border border-slate-200 flex items-center justify-between gap-4">
        <div className="w-full max-w-sm">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Cari karyawan, nomor rekening, catatan..."
            className="w-full text-xs"
          />
        </div>
        <p className="text-xs text-slate-500 hidden sm:block">
          {activeTab === "accounts"
            ? `Menampilkan ${filteredAccounts.length} dari ${accounts.length} rekening`
            : `Menampilkan ${filteredTransactions.length} transaksi terakhir`}
        </p>
      </div>

      {/* Main Table Content */}
      {/* Main Table Content */}
      {activeTab === "accounts" ? (
        <div className="aj-surface border border-slate-200 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 uppercase tracking-wider text-slate-600 border-b border-slate-200 text-[11px]">
              <tr>
                <th className="px-4 py-3 font-semibold">No. Rekening</th>
                <th className="px-4 py-3 font-semibold">Nama Karyawan</th>
                <th className="px-4 py-3 font-semibold">Departemen</th>
                <th className="px-4 py-3 font-semibold text-right">Saldo Tabungan</th>
                <th className="px-4 py-3 font-semibold text-center">Status</th>
                <th className="px-4 py-3 font-semibold text-center">Aksi Cepat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Tidak ada data rekening simpanan ditemukan.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-mono font-medium text-slate-900">
                      {acc.accountNumber}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{acc.employee.name}</div>
                      {acc.employee.nik && (
                        <div className="text-[10px] text-slate-500 font-mono">
                          NIK: {acc.employee.nik}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-[10px] font-medium text-slate-700">
                        {acc.employee.department}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700 tabular-nums">
                      {formatCurrency(Number(acc.balance))}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          acc.isActive
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {acc.isActive ? "Aktif" : "Non-Aktif"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedEmployeeId(acc.employee.id);
                            setIsDepositOpen(true);
                          }}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-semibold text-slate-700 transition"
                          title="Setor Simpanan"
                        >
                          + Setor
                        </button>
                        <button
                          onClick={() => {
                            setSelectedAccountId(acc.id);
                            setIsWithdrawalOpen(true);
                          }}
                          disabled={Number(acc.balance) <= 0}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-semibold text-slate-700 transition disabled:opacity-40"
                          title="Tarik Simpanan"
                        >
                          − Tarik
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="aj-surface border border-slate-200 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 uppercase tracking-wider text-slate-600 border-b border-slate-200 text-[11px]">
              <tr>
                <th className="px-4 py-3 font-semibold">Tanggal</th>
                <th className="px-4 py-3 font-semibold">Karyawan</th>
                <th className="px-4 py-3 font-semibold text-center">Tipe Mutasi</th>
                <th className="px-4 py-3 font-semibold text-right">Nominal</th>
                <th className="px-4 py-3 font-semibold text-right">Saldo Akhir</th>
                <th className="px-4 py-3 font-semibold">Rekening Bank / Kas</th>
                <th className="px-4 py-3 font-semibold">Buku Jurnal</th>
                <th className="px-4 py-3 font-semibold">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Belum ada riwayat transaksi simpanan tercatat.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((trx) => {
                  const isDeposit = trx.type === "DEPOSIT";
                  const dateStr =
                    typeof trx.transactionDate === "string"
                      ? trx.transactionDate.slice(0, 10)
                      : jakartaDateKey(new Date(trx.transactionDate));

                  return (
                    <tr key={trx.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-mono text-slate-500">{dateStr}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">
                          {trx.savingsAccount.employee.name}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {trx.savingsAccount.employee.department}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isDeposit
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {isDeposit ? "SETORAN" : "PENARIKAN"}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-bold tabular-nums ${
                          isDeposit ? "text-emerald-700" : "text-rose-600"
                        }`}
                      >
                        {isDeposit ? "+" : "-"} {formatCurrency(Number(trx.amount))}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-900 tabular-nums">
                        {formatCurrency(Number(trx.balanceAfter))}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {trx.rekeningAccount?.name || "Kas Perusahaan"}
                      </td>
                      <td className="px-4 py-3">
                        {trx.journalEntry ? (
                          <span className="inline-block px-1.5 py-0.5 rounded font-mono text-[10px] bg-slate-100 text-slate-800 border border-slate-200">
                            {trx.journalEntry.journalNumber}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-[11px] max-w-xs truncate">
                        {trx.notes || "-"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Deposit Modal */}
      {isDepositOpen && (
        <SavingsDepositModal
          employees={employees}
          rekenings={rekenings}
          defaultEmployeeId={selectedEmployeeId}
          isOpen={isDepositOpen}
          onClose={() => setIsDepositOpen(false)}
          onSuccess={refreshData}
        />
      )}

      {/* Withdrawal Modal */}
      {isWithdrawalOpen && (
        <SavingsWithdrawalModal
          accounts={accountOptions}
          rekenings={rekenings}
          defaultAccountId={selectedAccountId}
          isOpen={isWithdrawalOpen}
          onClose={() => setIsWithdrawalOpen(false)}
          onSuccess={refreshData}
        />
      )}
    </div>
  );
}
