"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { useToast } from "@/components/ui/ToastProvider";
import type { BookkeepingType, RekeningAccount } from "@/lib/business/masterData";
import { INDONESIAN_BANKS } from "@/lib/paymentAccounts";

type Props = { types: BookkeepingType[]; rekenings: RekeningAccount[] };
type RekeningDraft = {
  bank: string;
  name: string;
  accountNumber: string;
  erpCoaId: string;
  erpCoaNameSnapshot: string;
  tipeIds: string[];
  currency: string;
  openingBalanceValas: number;
  openingBalanceDate: string;
  openingRate: number;
};

const SUPPORTED_CURRENCIES = [
  { code: "IDR", name: "IDR - Rupiah Indonesia" },
  { code: "USD", name: "USD - US Dollar" },
  { code: "RMB", name: "RMB / CNY - Chinese Yuan" }
];

export function RekeningManager({ types, rekenings: initial }: Props) {
  const { showToast } = useToast();
  const [rekenings, setRekenings] = useState(initial);
  const [bank, setBank] = useState("BCA");
  const [name, setName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [erpCoaId, setErpCoaId] = useState("");
  const [erpCoaNameSnapshot, setErpCoaNameSnapshot] = useState("");
  const [currency, setCurrency] = useState("IDR");
  const [openingBalanceValas, setOpeningBalanceValas] = useState<number>(0);
  const [openingBalanceDate, setOpeningBalanceDate] = useState<string>("");
  const [openingRate, setOpeningRate] = useState<number>(1);
  const [selectedTipeIds, setSelectedTipeIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RekeningDraft>({
    bank: "BCA",
    name: "",
    accountNumber: "",
    erpCoaId: "",
    erpCoaNameSnapshot: "",
    tipeIds: [],
    currency: "IDR",
    openingBalanceValas: 0,
    openingBalanceDate: "",
    openingRate: 1
  });
  const [saving, setSaving] = useState(false);
  const [rekeningToToggle, setRekeningToToggle] = useState<{ rek: RekeningAccount; targetStatus: boolean } | null>(null);

  const toggleTipe = (id: string) =>
    setSelectedTipeIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  const toggleDraftTipe = (id: string) =>
    setDraft((prev) => ({
      ...prev,
      tipeIds: prev.tipeIds.includes(id) ? prev.tipeIds.filter((t) => t !== id) : [...prev.tipeIds, id]
    }));

  const handleCurrencyChange = (newCurr: string) => {
    setCurrency(newCurr);
    if (newCurr === "IDR") {
      setOpeningRate(1);
      setOpeningBalanceValas(0);
    } else if (newCurr === "USD") {
      setOpeningRate(16200);
    } else if (newCurr === "RMB") {
      setOpeningRate(2250);
    }
  };

  const handleDraftCurrencyChange = (newCurr: string) => {
    setDraft((prev) => ({
      ...prev,
      currency: newCurr,
      openingRate: newCurr === "IDR" ? 1 : newCurr === "USD" ? 16200 : 2250,
      openingBalanceValas: newCurr === "IDR" ? 0 : prev.openingBalanceValas
    }));
  };

  const beginEdit = (rek: RekeningAccount) => {
    setEditingId(rek.id);
    setDraft({
      bank: rek.bank,
      name: rek.name,
      accountNumber: rek.accountNumber === "-" ? "" : rek.accountNumber,
      erpCoaId: rek.erpCoaId || "",
      erpCoaNameSnapshot: rek.erpCoaNameSnapshot || "",
      tipeIds: rek.tipeIds,
      currency: rek.currency || "IDR",
      openingBalanceValas: rek.openingBalanceValas || 0,
      openingBalanceDate: rek.openingBalanceDate ? rek.openingBalanceDate.split("T")[0] : "",
      openingRate: rek.openingRate || 1
    });
  };

  const addRekening = async () => {
    if (!name.trim()) {
      showToast("Nama rekening wajib diisi.", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/rekening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank,
          name: name.trim(),
          accountNumber: accountNumber.trim() || "-",
          erpCoaId: erpCoaId.trim(),
          erpCoaNameSnapshot: erpCoaNameSnapshot.trim(),
          tipeIds: selectedTipeIds,
          currency,
          openingBalanceValas: Number(openingBalanceValas) || 0,
          openingBalanceDate: openingBalanceDate || undefined,
          openingRate: Number(openingRate) || 1
        })
      });
      const result = await res.json();
      if (result.success) {
        setRekenings((prev) => [...prev, result.data]);
        setName("");
        setAccountNumber("");
        setErpCoaId("");
        setErpCoaNameSnapshot("");
        setCurrency("IDR");
        setOpeningBalanceValas(0);
        setOpeningBalanceDate("");
        setOpeningRate(1);
        setSelectedTipeIds([]);
        showToast("Rekening berhasil ditambahkan.", "success");
      } else {
        showToast(result.message || "Gagal menambah rekening.", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan saat menambah rekening.", "error");
    } finally {
      setSaving(false);
    }
  };

  const assignedTipes = (tipeIds: string[]) =>
    tipeIds.length > 0 ? (
      tipeIds.map((id) => (
        <span key={id} className="rounded-sm bg-slate-100 border border-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-800">
          {id}
        </span>
      ))
    ) : (
      <span className="text-slate-400">-</span>
    );

  const statusBadge = (active: boolean) => (
    <span
      className={`rounded-sm px-2.5 py-0.5 text-xs font-semibold ${
        active ? "bg-emerald-50 border border-emerald-300 text-emerald-800" : "bg-slate-100 border border-slate-300 text-slate-600"
      }`}
    >
      {active ? "Aktif" : "Nonaktif"}
    </span>
  );

  const currencyBadge = (curr: string) => {
    const isValas = curr && curr !== "IDR";
    return (
      <span
        className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded-sm border ${
          isValas
            ? "bg-amber-50 border-amber-300 text-amber-900"
            : "bg-slate-50 border-slate-300 text-slate-700"
        }`}
      >
        {curr || "IDR"}
      </span>
    );
  };

  const draftTipePicker = (
    <div className="flex flex-wrap gap-2">
      {types
        .filter((t) => t.isActive)
        .map((tipe) => (
          <button
            key={tipe.id}
            type="button"
            onClick={() => toggleDraftTipe(tipe.id)}
            className={`rounded-sm border px-3 py-1 text-xs font-semibold transition ${
              draft.tipeIds.includes(tipe.id)
                ? "bg-emerald-700 border-emerald-800 text-white"
                : "bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {tipe.code}
          </button>
        ))}
    </div>
  );

  const updateRekening = async (rek: RekeningAccount, patch?: Partial<RekeningAccount>) => {
    const payload = patch || {
      bank: draft.bank,
      name: draft.name.trim(),
      accountNumber: draft.accountNumber.trim() || "-",
      erpCoaId: draft.erpCoaId.trim(),
      erpCoaNameSnapshot: draft.erpCoaNameSnapshot.trim(),
      tipeIds: draft.tipeIds,
      currency: draft.currency,
      openingBalanceValas: Number(draft.openingBalanceValas) || 0,
      openingBalanceDate: draft.openingBalanceDate || undefined,
      openingRate: Number(draft.openingRate) || 1
    };
    if (!payload.name && !patch) {
      showToast("Nama rekening wajib diisi.", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/rekening", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rek.id, ...payload })
      });
      const result = await res.json();
      if (result.success) {
        setRekenings((prev) => prev.map((item) => (item.id === rek.id ? result.data : item)));
        setEditingId(null);
        showToast("Rekening berhasil diperbarui.", "success");
      } else {
        showToast(result.message || "Gagal update rekening.", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan saat update rekening.", "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmToggleStatus = async () => {
    if (!rekeningToToggle) return;
    setSaving(true);
    try {
      const res = await fetch("/api/rekening", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rekeningToToggle.rek.id, isActive: rekeningToToggle.targetStatus })
      });
      const result = await res.json();
      if (result.success) {
        setRekenings((prev) =>
          prev.map((item) => (item.id === rekeningToToggle.rek.id ? result.data : item))
        );
        showToast(
          `Rekening ${rekeningToToggle.rek.name} berhasil ${
            rekeningToToggle.targetStatus ? "diaktifkan" : "dinonaktifkan"
          }.`,
          "success"
        );
        setRekeningToToggle(null);
      } else {
        showToast(result.message || "Gagal memperbarui status rekening.", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan saat memperbarui status rekening.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="aj-surface">
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Daftar Rekening Bank & Valas</h3>
              <p className="mt-1 text-xs text-slate-500">
                1 Rekening Fisik = 1 Mata Uang (IDR, USD, RMB). Rekening valas mencatat saldo awal dan kurs konversi buku.
              </p>
            </div>
          </div>
        </div>

        {/* Mobile View */}
        <div className="space-y-3 p-4 md:hidden">
          {rekenings.map((rek) => (
            <article key={rek.id} className="rounded-sm border border-slate-200 bg-white p-4 shadow-sm">
              {editingId === rek.id ? (
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-slate-700">
                    <span className="mb-1 block">Nama rekening</span>
                    <Input value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    <span className="mb-1 block">Mata Uang</span>
                    <Select value={draft.currency} onChange={(e) => handleDraftCurrencyChange(e.target.value)}>
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  {draft.currency !== "IDR" && (
                    <div className="rounded-sm border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                      <label className="block text-xs font-semibold text-amber-900">
                        Saldo Awal Valas ({draft.currency})
                        <Input
                          type="number"
                          step="any"
                          value={draft.openingBalanceValas || ""}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, openingBalanceValas: parseFloat(e.target.value) || 0 }))
                          }
                        />
                      </label>
                      <label className="block text-xs font-semibold text-amber-900">
                        Kurs Awal (Rp/{draft.currency})
                        <Input
                          type="number"
                          value={draft.openingRate || ""}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, openingRate: parseFloat(e.target.value) || 1 }))
                          }
                        />
                      </label>
                    </div>
                  )}
                  <label className="block text-sm font-medium text-slate-700">
                    <span className="mb-1 block">Bank</span>
                    <Select value={draft.bank} onChange={(e) => setDraft((prev) => ({ ...prev, bank: e.target.value }))}>
                      {INDONESIAN_BANKS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    <span className="mb-1 block">Nomor rekening</span>
                    <Input
                      value={draft.accountNumber}
                      onChange={(e) => setDraft((prev) => ({ ...prev, accountNumber: e.target.value }))}
                      placeholder="-"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    <span className="mb-1 block">COA code / alias ERP</span>
                    <Input
                      value={draft.erpCoaId}
                      onChange={(e) => setDraft((prev) => ({ ...prev, erpCoaId: e.target.value }))}
                    />
                  </label>
                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-700">Tipe yang diassign</p>
                    {draftTipePicker}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" onClick={() => updateRekening(rek)} disabled={saving} className="w-full">
                      Simpan
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setEditingId(null)}
                      disabled={saving}
                      className="w-full"
                    >
                      Batal
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-slate-900">{rek.name}</h4>
                        {currencyBadge(rek.currency || "IDR")}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{rek.bank}</p>
                    </div>
                    {statusBadge(rek.isActive !== false)}
                  </div>
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Nomor rekening</dt>
                      <dd className="mt-1 font-mono text-slate-700">{rek.accountNumber}</dd>
                    </div>
                    {rek.currency && rek.currency !== "IDR" && (
                      <div className="rounded border border-amber-200 bg-amber-50/50 p-2 text-xs">
                        <div className="font-semibold text-amber-900">
                          Saldo Awal: {rek.currency}{" "}
                          {(rek.openingBalanceValas || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-amber-800">
                          Kurs: Rp {(rek.openingRate || 1).toLocaleString("id-ID")} (≈ Rp{" "}
                          {((rek.openingBalanceValas || 0) * (rek.openingRate || 1)).toLocaleString("id-ID")})
                        </div>
                      </div>
                    )}
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tipe yang diassign</dt>
                      <dd className="mt-1 flex flex-wrap gap-1">{assignedTipes(rek.tipeIds)}</dd>
                    </div>
                  </dl>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="secondary" onClick={() => beginEdit(rek)} className="w-full">
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant={rek.isActive !== false ? "danger" : "secondary"}
                      onClick={() => setRekeningToToggle({ rek, targetStatus: rek.isActive === false })}
                      disabled={saving}
                      className="w-full"
                    >
                      {rek.isActive !== false ? "Nonaktifkan" : "Aktifkan"}
                    </Button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>

        {/* Desktop Table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[1000px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-semibold">
              <tr>
                <th className="px-5 py-3">Nama & ID</th>
                <th className="px-5 py-3">Mata Uang</th>
                <th className="px-5 py-3">Bank & No. Rek</th>
                <th className="px-5 py-3">Saldo Valas & Kurs</th>
                <th className="px-5 py-3">COA/Alias ERP</th>
                <th className="px-5 py-3">Tipe</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rekenings.map((rek) => (
                <tr key={rek.id} className="border-b border-slate-100 align-top hover:bg-slate-50/50">
                  {editingId === rek.id ? (
                    <>
                      <td className="px-5 py-4">
                        <Input
                          value={draft.name}
                          onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                        />
                        <div className="mt-1 font-mono text-xs text-slate-400">ID: {rek.id}</div>
                      </td>
                      <td className="px-5 py-4">
                        <Select
                          value={draft.currency}
                          onChange={(e) => handleDraftCurrencyChange(e.target.value)}
                        >
                          {SUPPORTED_CURRENCIES.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.code}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-5 py-4 space-y-2">
                        <Select
                          value={draft.bank}
                          onChange={(e) => setDraft((prev) => ({ ...prev, bank: e.target.value }))}
                        >
                          {INDONESIAN_BANKS.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </Select>
                        <Input
                          value={draft.accountNumber}
                          onChange={(e) => setDraft((prev) => ({ ...prev, accountNumber: e.target.value }))}
                          placeholder="No. Rekening"
                        />
                      </td>
                      <td className="px-5 py-4">
                        {draft.currency !== "IDR" ? (
                          <div className="space-y-1.5 text-xs">
                            <div>
                              <span className="text-slate-500">Saldo Awal Valas:</span>
                              <Input
                                type="number"
                                step="any"
                                value={draft.openingBalanceValas || ""}
                                onChange={(e) =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    openingBalanceValas: parseFloat(e.target.value) || 0
                                  }))
                                }
                              />
                            </div>
                            <div>
                              <span className="text-slate-500">Kurs Konversi:</span>
                              <Input
                                type="number"
                                value={draft.openingRate || ""}
                                onChange={(e) =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    openingRate: parseFloat(e.target.value) || 1
                                  }))
                                }
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          <Input
                            value={draft.erpCoaId}
                            onChange={(e) => setDraft((prev) => ({ ...prev, erpCoaId: e.target.value }))}
                            placeholder="Kode COA"
                          />
                          <Input
                            value={draft.erpCoaNameSnapshot}
                            onChange={(e) => setDraft((prev) => ({ ...prev, erpCoaNameSnapshot: e.target.value }))}
                            placeholder="Nama Akun"
                          />
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex max-w-xs flex-wrap gap-1">{draftTipePicker}</div>
                      </td>
                      <td className="px-5 py-4">{statusBadge(rek.isActive !== false)}</td>
                      <td className="px-5 py-4">
                        <div className="flex gap-2">
                          <Button type="button" onClick={() => updateRekening(rek)} disabled={saving}>
                            Simpan
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setEditingId(null)}
                            disabled={saving}
                          >
                            Batal
                          </Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">{rek.name}</div>
                        <div className="mt-0.5 font-mono text-xs font-medium text-emerald-700">{rek.id}</div>
                      </td>
                      <td className="px-5 py-4">{currencyBadge(rek.currency || "IDR")}</td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-800">{rek.bank}</div>
                        <div className="font-mono text-xs text-slate-500">{rek.accountNumber}</div>
                      </td>
                      <td className="px-5 py-4">
                        {rek.currency && rek.currency !== "IDR" ? (
                          <div className="font-mono text-xs">
                            <div className="font-semibold text-amber-900">
                              {rek.currency}{" "}
                              {(rek.openingBalanceValas || 0).toLocaleString("en-US", {
                                minimumFractionDigits: 2
                              })}
                            </div>
                            <div className="text-slate-500">
                              Kurs: Rp {(rek.openingRate || 1).toLocaleString("id-ID")}
                            </div>
                            <div className="text-slate-400 text-[11px]">
                              ≈ Rp{" "}
                              {((rek.openingBalanceValas || 0) * (rek.openingRate || 1)).toLocaleString("id-ID")}
                            </div>
                          </div>
                        ) : (
                          <span className="font-mono text-xs text-slate-400">IDR Fisik</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {rek.erpCoaId ? (
                          <span className="font-mono text-xs">
                            {rek.erpCoaId}
                            {rek.erpCoaNameSnapshot ? ` - ${rek.erpCoaNameSnapshot}` : ""}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">Belum diatur</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1">{assignedTipes(rek.tipeIds)}</div>
                      </td>
                      <td className="px-5 py-4">{statusBadge(rek.isActive !== false)}</td>
                      <td className="px-5 py-4">
                        <div className="flex gap-2">
                          <Button type="button" variant="secondary" onClick={() => beginEdit(rek)}>
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant={rek.isActive !== false ? "danger" : "secondary"}
                            onClick={() =>
                              setRekeningToToggle({ rek, targetStatus: rek.isActive === false })
                            }
                            disabled={saving}
                          >
                            {rek.isActive !== false ? "Nonaktifkan" : "Aktifkan"}
                          </Button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tambah Rekening Baru Form */}
      <section className="aj-surface max-w-xl p-5 sm:p-6">
        <h3 className="font-bold text-slate-900">Tambah Rekening Baru</h3>
        <p className="mt-1 text-xs text-slate-500">
          Buat rekening operasional rupiah atau valuta asing untuk transaksi pembayaran importir.
        </p>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-slate-700">
              <span className="mb-1 block">
                Mata Uang <span className="text-red-500">*</span>
              </span>
              <Select value={currency} onChange={(e) => handleCurrencyChange(e.target.value)}>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              <span className="mb-1 block">
                Bank <span className="text-red-500">*</span>
              </span>
              <Select value={bank} onChange={(e) => setBank(e.target.value)}>
                {INDONESIAN_BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <label className="block text-sm font-medium text-slate-700">
            <span className="mb-1 block">
              Nama Rekening <span className="text-red-500">*</span>
            </span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: BCA USD Operasional atau Bank Mandiri Valas"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            <span className="mb-1 block">Nomor Rekening</span>
            <Input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Masukkan nomor rekening resmi"
            />
          </label>

          {currency !== "IDR" && (
            <div className="rounded-sm border border-amber-300 bg-amber-50/60 p-4 space-y-3">
              <div className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                Pengaturan Saldo Awal Valas ({currency})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-amber-900">
                  <span className="mb-1 block">Saldo Awal Valas ({currency})</span>
                  <Input
                    type="number"
                    step="any"
                    value={openingBalanceValas || ""}
                    onChange={(e) => setOpeningBalanceValas(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                  />
                </label>
                <label className="block text-xs font-semibold text-amber-900">
                  <span className="mb-1 block">Kurs Awal (Rp/{currency})</span>
                  <Input
                    type="number"
                    value={openingRate || ""}
                    onChange={(e) => setOpeningRate(parseFloat(e.target.value) || 1)}
                    placeholder="16200"
                  />
                </label>
              </div>
              <label className="block text-xs font-semibold text-amber-900">
                <span className="mb-1 block">Tanggal Saldo Awal</span>
                <Input
                  type="date"
                  value={openingBalanceDate}
                  onChange={(e) => setOpeningBalanceDate(e.target.value)}
                />
              </label>
              <div className="text-xs font-mono text-amber-800 bg-white/70 p-2 rounded border border-amber-200">
                Estimasi Nilai Buku IDR:{" "}
                <span className="font-bold">
                  Rp {(openingBalanceValas * openingRate).toLocaleString("id-ID")}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-slate-700">
              <span className="mb-1 block">COA Code / Alias ERP</span>
              <Input
                value={erpCoaId}
                onChange={(e) => setErpCoaId(e.target.value)}
                placeholder="1-1001 atau BCA_USD"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              <span className="mb-1 block">Nama Akun ERP</span>
              <Input
                value={erpCoaNameSnapshot}
                onChange={(e) => setErpCoaNameSnapshot(e.target.value)}
                placeholder="Contoh: Bank BCA USD"
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Assign ke Tipe Pembukuan</p>
            <div className="flex flex-wrap gap-2">
              {types
                .filter((t) => t.isActive)
                .map((tipe) => (
                  <button
                    key={tipe.id}
                    type="button"
                    onClick={() => toggleTipe(tipe.id)}
                    className={`rounded-sm border px-3 py-1 text-xs font-semibold transition ${
                      selectedTipeIds.includes(tipe.id)
                        ? "bg-emerald-700 border-emerald-800 text-white"
                        : "bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {tipe.code}
                  </button>
                ))}
            </div>
          </div>
        </div>

        <Button className="mt-5" onClick={addRekening} disabled={saving}>
          {saving ? "Menyimpan..." : "Tambah Rekening"}
        </Button>
      </section>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={Boolean(rekeningToToggle)}
        title={rekeningToToggle?.targetStatus ? "Aktifkan Rekening Bank" : "Nonaktifkan Rekening Bank"}
        message={
          rekeningToToggle
            ? rekeningToToggle.targetStatus
              ? `Aktifkan kembali rekening "${rekeningToToggle.rek.name}" (${rekeningToToggle.rek.bank})? Rekening ini akan kembali muncul di opsi pilihan pembayaran transaksi baru.`
              : `Nonaktifkan rekening "${rekeningToToggle.rek.name}" (${rekeningToToggle.rek.bank})? Rekening ini tidak akan muncul di opsi pilihan pembayaran transaksi baru.`
            : ""
        }
        confirmLabel={rekeningToToggle?.targetStatus ? "Ya, Aktifkan" : "Ya, Nonaktifkan"}
        cancelLabel="Batal"
        variant={rekeningToToggle?.targetStatus ? "primary" : "danger"}
        isLoading={saving}
        onConfirm={confirmToggleStatus}
        onCancel={() => {
          if (!saving) setRekeningToToggle(null);
        }}
      />
    </div>
  );
}
