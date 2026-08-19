"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Toast } from "@/components/ui/Toast";
import type { BookkeepingType, RekeningAccount } from "@/lib/business/masterData";
import { INDONESIAN_BANKS } from "@/lib/paymentAccounts";

type Props = { types: BookkeepingType[]; rekenings: RekeningAccount[] };
type RekeningDraft = { bank: string; name: string; accountNumber: string; erpCoaId: string; erpCoaNameSnapshot: string; tipeIds: string[] };

export function RekeningManager({ types, rekenings: initial }: Props) {
  const [rekenings, setRekenings] = useState(initial);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string }>();
  const [bank, setBank] = useState("BCA");
  const [name, setName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [erpCoaId, setErpCoaId] = useState("");
  const [erpCoaNameSnapshot, setErpCoaNameSnapshot] = useState("");
  const [selectedTipeIds, setSelectedTipeIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RekeningDraft>({ bank: "BCA", name: "", accountNumber: "", erpCoaId: "", erpCoaNameSnapshot: "", tipeIds: [] });
  const [saving, setSaving] = useState(false);

  const toggleTipe = (id: string) => setSelectedTipeIds((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  const toggleDraftTipe = (id: string) => setDraft((prev) => ({ ...prev, tipeIds: prev.tipeIds.includes(id) ? prev.tipeIds.filter((t) => t !== id) : [...prev.tipeIds, id] }));

  const beginEdit = (rek: RekeningAccount) => {
    setEditingId(rek.id);
    setDraft({ bank: rek.bank, name: rek.name, accountNumber: rek.accountNumber === "-" ? "" : rek.accountNumber, erpCoaId: rek.erpCoaId || "", erpCoaNameSnapshot: rek.erpCoaNameSnapshot || "", tipeIds: rek.tipeIds });
  };

  const addRekening = async () => {
    if (!name.trim()) { setNotice({ type: "error", message: "Nama rekening wajib diisi." }); return; }
    setSaving(true);
    const res = await fetch("/api/rekening", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bank, name: name.trim(), accountNumber: accountNumber.trim() || "-", erpCoaId: erpCoaId.trim(), erpCoaNameSnapshot: erpCoaNameSnapshot.trim(), tipeIds: selectedTipeIds }) });
    const result = await res.json();
    if (result.success) { setRekenings((prev) => [...prev, result.data]); setName(""); setAccountNumber(""); setErpCoaId(""); setErpCoaNameSnapshot(""); setSelectedTipeIds([]); setNotice({ type: "success", message: "Rekening berhasil ditambahkan." }); }
    else setNotice({ type: "error", message: result.message || "Gagal menambah rekening." });
    setSaving(false);
  };

  const assignedTipes = (tipeIds: string[]) => tipeIds.length > 0 ? tipeIds.map((id) => <span key={id} className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">{id}</span>) : <span className="text-slate-400">-</span>;

  const statusBadge = (active: boolean) => (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{active ? "Aktif" : "Nonaktif"}</span>
  );

  const draftTipePicker = (
    <div className="flex flex-wrap gap-2">
      {types.filter((t) => t.isActive).map((tipe) => (
        <button key={tipe.id} type="button" onClick={() => toggleDraftTipe(tipe.id)} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${draft.tipeIds.includes(tipe.id) ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"}`}>{tipe.code}</button>
      ))}
    </div>
  );

  const updateRekening = async (rek: RekeningAccount, patch?: Partial<RekeningAccount>) => {
    const payload = patch || { bank: draft.bank, name: draft.name.trim(), accountNumber: draft.accountNumber.trim() || "-", erpCoaId: draft.erpCoaId.trim(), erpCoaNameSnapshot: draft.erpCoaNameSnapshot.trim(), tipeIds: draft.tipeIds };
    if (!payload.name && !patch) { setNotice({ type: "error", message: "Nama rekening wajib diisi." }); return; }
    setSaving(true);
    const res = await fetch("/api/rekening", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rek.id, ...payload }) });
    const result = await res.json();
    if (result.success) {
      setRekenings((prev) => prev.map((item) => item.id === rek.id ? result.data : item));
      setEditingId(null);
      setNotice({ type: "success", message: "Rekening berhasil diperbarui." });
    } else {
      setNotice({ type: "error", message: result.message || "Gagal update rekening." });
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      {notice && <Toast {...notice} />}
      <section className="aj-surface">
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <h3 className="font-bold">Daftar Rekening</h3>
          <p className="mt-1 text-xs text-slate-500">Rekening dapat diassign ke satu atau banyak tipe. Tipe menentukan rekening mana yang tampil di form transaksi.</p>
        </div>
        <div className="space-y-3 p-4 md:hidden">
          {rekenings.map((rek) => (
            <article key={rek.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              {editingId === rek.id ? (
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">Nama rekening</span><Input value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} /></label>
                  <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">Bank</span><Select value={draft.bank} onChange={(e) => setDraft((prev) => ({ ...prev, bank: e.target.value }))}>{INDONESIAN_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}</Select></label>
                  <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">Nomor rekening</span><Input value={draft.accountNumber} onChange={(e) => setDraft((prev) => ({ ...prev, accountNumber: e.target.value }))} placeholder="-" /></label>
                  <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">COA code / alias ERP</span><Input value={draft.erpCoaId} onChange={(e) => setDraft((prev) => ({ ...prev, erpCoaId: e.target.value }))} placeholder="1112.01 atau BCA_OPERASIONAL" /></label>
                  <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">Nama akun ERP</span><Input value={draft.erpCoaNameSnapshot} onChange={(e) => setDraft((prev) => ({ ...prev, erpCoaNameSnapshot: e.target.value }))} placeholder="Contoh: Bank BCA" /></label>
                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-700">Tipe yang diassign</p>
                    {draftTipePicker}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" onClick={() => updateRekening(rek)} disabled={saving} className="w-full">Simpan</Button>
                    <Button type="button" variant="secondary" onClick={() => setEditingId(null)} disabled={saving} className="w-full">Batal</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-slate-900">{rek.name}</h4>
                      <p className="mt-1 text-sm text-slate-500">{rek.bank}</p>
                    </div>
                    {statusBadge(rek.isActive !== false)}
                  </div>
                  <dl className="space-y-3 text-sm">
                    <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">ID Rekening SLM</dt><dd className="mt-1 font-mono text-xs font-semibold text-sky-700">{rek.id}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Nomor rekening</dt><dd className="mt-1 font-mono text-slate-700">{rek.accountNumber}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">COA/Alias ERP</dt><dd className="mt-1 text-slate-700">{rek.erpCoaId ? `${rek.erpCoaId}${rek.erpCoaNameSnapshot ? ` - ${rek.erpCoaNameSnapshot}` : ""}` : "Belum diatur"}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tipe yang diassign</dt><dd className="mt-1 flex flex-wrap gap-1">{assignedTipes(rek.tipeIds)}</dd></div>
                  </dl>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="secondary" onClick={() => beginEdit(rek)} className="w-full">Edit</Button>
                    <Button type="button" variant={rek.isActive !== false ? "danger" : "secondary"} onClick={() => updateRekening(rek, { isActive: rek.isActive === false })} disabled={saving} className="w-full">{rek.isActive !== false ? "Nonaktifkan" : "Aktifkan"}</Button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
        <p className="hidden px-5 pt-3 text-xs text-slate-500 md:block lg:hidden">Geser tabel untuk melihat kolom lainnya.</p>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[920px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="px-5 py-3">Nama & ID</th><th className="px-5 py-3">Bank</th><th className="px-5 py-3">Nomor rekening</th><th className="px-5 py-3">COA/Alias ERP</th><th className="px-5 py-3">Tipe yang diassign</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Aksi</th></tr>
            </thead>
            <tbody>
            {rekenings.map((rek) => (
              <tr key={rek.id} className="border-b border-slate-100 align-top">
                {editingId === rek.id ? (
                  <>
                    <td className="px-5 py-4">
                      <Input value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} />
                      <div className="mt-1 font-mono text-xs text-slate-400">ID: {rek.id}</div>
                    </td>
                    <td className="px-5 py-4"><Select value={draft.bank} onChange={(e) => setDraft((prev) => ({ ...prev, bank: e.target.value }))}>{INDONESIAN_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}</Select></td>
                    <td className="px-5 py-4"><Input value={draft.accountNumber} onChange={(e) => setDraft((prev) => ({ ...prev, accountNumber: e.target.value }))} placeholder="-" /></td>
                    <td className="px-5 py-4"><div className="space-y-2"><Input value={draft.erpCoaId} onChange={(e) => setDraft((prev) => ({ ...prev, erpCoaId: e.target.value }))} placeholder="1112.01 atau BCA_OPERASIONAL" /><Input value={draft.erpCoaNameSnapshot} onChange={(e) => setDraft((prev) => ({ ...prev, erpCoaNameSnapshot: e.target.value }))} placeholder="Nama akun" /></div></td>
                    <td className="px-5 py-4">
                      <div className="flex max-w-xs flex-wrap gap-2">
                        {draftTipePicker}
                      </div>
                    </td>
                    <td className="px-5 py-4">{statusBadge(rek.isActive !== false)}</td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <Button type="button" onClick={() => updateRekening(rek)} disabled={saving}>Simpan</Button>
                        <Button type="button" variant="secondary" onClick={() => setEditingId(null)} disabled={saving}>Batal</Button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">{rek.name}</div>
                      <div className="mt-0.5 font-mono text-xs font-medium text-sky-700">{rek.id}</div>
                    </td>
                    <td className="px-5 py-4">{rek.bank}</td>
                    <td className="px-5 py-4 font-mono text-slate-600">{rek.accountNumber}</td>
                    <td className="px-5 py-4">{rek.erpCoaId ? <span>{rek.erpCoaId}{rek.erpCoaNameSnapshot ? ` - ${rek.erpCoaNameSnapshot}` : ""}</span> : <span className="text-slate-400">Belum diatur</span>}</td>
                    <td className="px-5 py-4"><div className="flex flex-wrap gap-1">{assignedTipes(rek.tipeIds)}</div></td>
                    <td className="px-5 py-4">{statusBadge(rek.isActive !== false)}</td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <Button type="button" variant="secondary" onClick={() => beginEdit(rek)}>Edit</Button>
                        <Button type="button" variant={rek.isActive !== false ? "danger" : "secondary"} onClick={() => updateRekening(rek, { isActive: rek.isActive === false })} disabled={saving}>{rek.isActive !== false ? "Nonaktifkan" : "Aktifkan"}</Button>
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
      <section className="aj-surface max-w-lg p-5 sm:p-6">
        <h3 className="font-bold">Tambah Rekening Baru</h3>
        <div className="mt-4 space-y-4">
          <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">Bank <span className="text-red-500">*</span></span><Select value={bank} onChange={(e) => setBank(e.target.value)}>{INDONESIAN_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}</Select></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">Nama rekening <span className="text-red-500">*</span></span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Masukkan nama rekening resmi" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">Nomor rekening</span><Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Masukkan nomor rekening resmi" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">COA code / alias ERP</span><Input value={erpCoaId} onChange={(e) => setErpCoaId(e.target.value)} placeholder="1112.01 atau BCA_OPERASIONAL" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">Nama akun ERP</span><Input value={erpCoaNameSnapshot} onChange={(e) => setErpCoaNameSnapshot(e.target.value)} placeholder="Contoh: Bank BCA" /></label>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Assign ke tipe</p>
            <div className="flex flex-wrap gap-2">
              {types.filter((t) => t.isActive).map((tipe) => (
                <button key={tipe.id} type="button" onClick={() => toggleTipe(tipe.id)} className={`rounded-full px-3 py-1 text-sm font-semibold transition ${selectedTipeIds.includes(tipe.id) ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"}`}>{tipe.code}</button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Pilih tipe yang dapat menggunakan rekening ini.</p>
          </div>
        </div>
        <Button className="mt-4" onClick={addRekening} disabled={saving}>{saving ? "Menyimpan..." : "Tambah Rekening"}</Button>
      </section>
    </div>
  );
}
