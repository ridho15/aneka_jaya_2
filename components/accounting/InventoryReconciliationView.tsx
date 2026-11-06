"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import type { InventoryReconciliation } from "@/lib/accounting/inventoryReconciliation";

const rp = (n: number) => `${n < 0 ? "−" : ""}Rp ${Math.abs(Math.round(n)).toLocaleString("id-ID")}`;

export function InventoryReconciliationView({ report: r, canManage }: { report: InventoryReconciliation; canManage: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [kind, setKind] = useState<"EQUIPMENT" | "MERCHANDISE">("EQUIPMENT");
  const [taxStatus, setTaxStatus] = useState<"NON_PKP" | "PKP">(r.tax?.status ?? "NON_PKP");
  const [taxDate, setTaxDate] = useState(r.tax?.effectiveDate ?? "");

  async function act(key: string, body: Record<string, unknown>) {
    setBusy(key);
    try {
      const res = await fetch("/api/accounting/inventory-reconciliation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      showToast(json.message || (json.success ? "Selesai." : "Gagal."), json.success ? "success" : "error");
      if (json.success) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const candidates = r.candidates.filter((c) => c.kind === kind);
  const openCount = (k: string) => r.candidates.filter((c) => c.kind === k && !c.decision).length;
  const p = r.projectedAfterProposals;
  const conflicts = r.roles.filter((x) => x.status === "conflict");

  const explain = [
    { label: "Saldo awal stok yang belum pernah dibukukan", value: r.stock.openingOriginal, after: null as number | null, note: "Belum diketahui sumbernya (modal atau utang). Tidak ditutup otomatis." },
    { label: "Stok yang belum punya lapisan FIFO (dinilai modal rata-rata)", value: r.stock.notYetLayered, after: null, note: "Otomatis jadi saldo awal saat barang itu bergerak lagi." },
    { label: "Pembelian barang lama yang dijurnal sebagai beban", value: p.merchandiseOpen, after: 0, note: "Usulan: reklasifikasi ke persediaan, per baris di bawah." },
    { label: "Dokumen stok yang belum dijurnal", value: p.pendingDocuments, after: 0, note: "Bisa diposting sekarang." }
  ];

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
        Halaman ini <b>dry run</b>: hanya membaca. Saldo berubah hanya bila Anda menekan tombol posting atau menyetujui koreksi per baris. Koreksi memakai jurnal baru; jurnal asli tidak dihapus.
      </p>

      {conflicts.length > 0 && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Kode akun bentrok: {conflicts.map((c) => `${c.code} dipakai "${c.existingName}" (seharusnya ${c.expectedName})`).join("; ")}. Jurnal otomatis untuk akun ini berhenti sampai diatur di <Link className="underline" href="/akuntansi/coa">COA</Link>.
        </p>
      )}

      <section className="aj-surface overflow-x-auto">
        <h3 className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-900">Rekonsiliasi persediaan</h3>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr><th className="px-4 py-2" /><th className="px-4 py-2 text-right">Sekarang</th><th className="hidden px-4 py-2 text-right sm:table-cell">Bila semua usulan diterapkan</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr><td className="px-4 py-2">Persediaan di buku besar (1-1005)</td><td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{rp(r.ledger.inventory)}</td><td className="hidden px-4 py-2 whitespace-nowrap text-right tabular-nums sm:table-cell">{rp(p.inventory)}</td></tr>
            <tr><td className="px-4 py-2">Nilai kartu stok (FIFO)</td><td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{rp(r.stock.total)}</td><td className="hidden px-4 py-2 whitespace-nowrap text-right tabular-nums sm:table-cell">{rp(r.stock.total)}</td></tr>
            <tr className="font-semibold"><td className="px-4 py-2">Selisih kartu stok − buku besar</td><td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{rp(r.difference)}</td><td className="hidden px-4 py-2 whitespace-nowrap text-right tabular-nums sm:table-cell">{rp(p.difference)}</td></tr>
            <tr><td colSpan={3} className="bg-slate-50 px-4 py-1.5 text-xs font-semibold text-slate-600">Yang sudah diketahui penyebabnya</td></tr>
            {explain.map((e) => (
              <tr key={e.label}>
                <td className="px-4 py-2">{e.label}<span className="block text-xs text-slate-500">{e.note}</span></td>
                <td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{rp(e.value)}</td>
                <td className="hidden px-4 py-2 whitespace-nowrap text-right tabular-nums text-slate-500 sm:table-cell">{e.after == null ? rp(e.value) : rp(e.after)}</td>
              </tr>
            ))}
            <tr className="font-semibold"><td className="px-4 py-2">Belum terjelaskan<span className="block text-xs font-normal text-slate-500">Perlu ditelusuri dengan dokumen (saldo awal, pembelian, retur).</span></td><td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{rp(r.unexplained)}</td><td className="hidden px-4 py-2 whitespace-nowrap text-right tabular-nums sm:table-cell">{rp(p.unexplained)}</td></tr>
          </tbody>
        </table>
        {r.stock.notYetLayeredNoCostProducts > 0 && <p className="border-t border-slate-200 px-4 py-2 text-xs text-amber-700">{r.stock.notYetLayeredNoCostProducts} barang punya stok tetapi modalnya 0, jadi belum bernilai.</p>}
      </section>

      <section className="aj-surface overflow-x-auto">
        <h3 className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-900">Asal saldo 1-1005</h3>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-4 py-2">Sumber</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Kredit</th><th className="px-4 py-2 text-right">Bersih</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {r.ledger.breakdown.map((b) => (
              <tr key={b.label}><td className="px-4 py-2">{b.label}<span className="ml-1 text-xs text-slate-500">({b.count} baris)</span></td><td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{rp(b.debit)}</td><td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{rp(b.credit)}</td><td className="px-4 py-2 text-right font-semibold tabular-nums">{rp(b.net)}</td></tr>
            ))}
            {!r.ledger.breakdown.length && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Belum ada jurnal persediaan.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="aj-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h3 className="font-semibold text-slate-900">Dokumen stok belum dijurnal <span className="font-normal text-slate-500">({r.pendingDocs.length})</span></h3>
          {canManage && r.pendingDocs.length > 0 && <Button className="min-h-10" disabled={busy !== null} onClick={() => act("docs", { action: "post_inventory_docs" })}>{busy === "docs" ? "Memposting..." : "Posting semua"}</Button>}
        </div>
        <ul className="divide-y divide-slate-100 text-sm">
          {r.pendingDocs.slice(0, 20).map((d) => (
            <li key={`${d.referenceType}:${d.referenceId}`} className="flex flex-wrap justify-between gap-x-4 px-4 py-2">
              <span>{d.referenceType === "STOCK_IN" ? "Barang masuk" : d.referenceType === "OPNAME" ? "Opname" : "Penyesuaian"} {d.referenceNumber} <span className="text-xs text-slate-500">{new Date(d.entryDate).toLocaleDateString("id-ID")}{d.incomplete ? ` · ${d.incomplete} baris modal belum lengkap` : ""}</span></span>
              <span className="tabular-nums">{d.increase ? `+${rp(d.increase)}` : ""}{d.decrease ? ` −${rp(d.decrease)}` : ""}</span>
            </li>
          ))}
          {!r.pendingDocs.length && <li className="px-4 py-4 text-slate-500">Semua dokumen stok sudah dijurnal.</li>}
        </ul>
      </section>

      <section className="aj-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h3 className="font-semibold text-slate-900">Usulan koreksi historis</h3>
          <div className="flex gap-1 text-sm">
            {(["EQUIPMENT", "MERCHANDISE"] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={`min-h-10 rounded-lg px-3 font-semibold ${kind === k ? "bg-emerald-700 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
                {k === "EQUIPMENT" ? "Peralatan → aset tetap" : "Barang dagang → persediaan"} ({openCount(k)})
              </button>
            ))}
          </div>
        </div>
        <p className="px-4 pt-3 text-xs text-slate-600">
          Daftar ini disusun dari kategori, akun, nominal dan teks pengeluaran, jadi perlu ditinjau satu per satu berdasarkan tujuan pemakaian dan bukti. Yang sudah dijurnal dikoreksi dengan jurnal koreksi bertanggal hari ini; yang belum dijurnal langsung dijurnal ke akun yang benar.
        </p>
        {canManage && (
          <label className="mx-4 mt-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <input type="checkbox" checked={backupConfirmed} onChange={(e) => setBackupConfirmed(e.target.checked)} /> Backup database sudah dibuat (wajib sebelum menerapkan koreksi)
          </label>
        )}
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-4 py-2">Pengeluaran</th><th className="px-4 py-2 text-right">Nominal</th><th className="px-4 py-2">Akun sekarang → usulan</th><th className="px-4 py-2">Alasan</th><th className="px-4 py-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {candidates.map((c) => (
                <tr key={c.expenseId} className={c.decision ? "text-slate-400" : undefined}>
                  <td className="px-4 py-2"><Link className="hover:underline" href={`/pengeluaran/${c.expenseId}`}>{c.description}</Link><span className="block text-xs text-slate-500">{c.date}{c.vendor ? ` · ${c.vendor}` : ""}</span></td>
                  <td className="whitespace-nowrap px-4 py-2 whitespace-nowrap text-right tabular-nums">{rp(c.amount)}</td>
                  <td className="px-4 py-2 text-xs">{c.currentAccount}<span className="block font-semibold text-slate-700">→ {c.proposedAccount}</span></td>
                  <td className="px-4 py-2 text-xs">{c.reasons.join(" · ")}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {c.decision ? (
                      <span className="text-xs">{c.decision.decision === "APPLIED" ? "Diterapkan" : "Bukan koreksi"} · {c.decision.by}</span>
                    ) : canManage ? (
                      <div className="flex justify-end gap-1">
                        <Button className="min-h-10" disabled={!backupConfirmed || busy !== null} onClick={() => act(c.expenseId, { action: "apply_correction", expenseId: c.expenseId, kind: c.kind, backupConfirmed })}>Terapkan</Button>
                        <Button variant="secondary" className="min-h-10" disabled={busy !== null} onClick={() => act(`d${c.expenseId}`, { action: "dismiss_correction", expenseId: c.expenseId, kind: c.kind })}>Bukan</Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!candidates.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Tidak ada kandidat.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="aj-surface">
        <h3 className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-900">Belum selesai</h3>
        <ul className="divide-y divide-slate-100 text-sm">
          <li className="flex justify-between gap-4 px-4 py-2"><span>Penjualan dengan HPP belum lengkap (modal belum diketahui)</span><b>{r.cogs.incomplete.length}</b></li>
          <li className="flex justify-between gap-4 px-4 py-2"><span>Penjualan approved tanpa jurnal HPP</span><b>{r.cogs.withoutCogs}</b></li>
          <li className="flex justify-between gap-4 px-4 py-2"><span>HPP lama yang berbentuk estimasi 85% harga jual (bukan biaya aktual, hanya ditandai)</span><b>{r.cogs.fallback.length} nota · {rp(r.cogs.fallbackTotal)}</b></li>
          <li className="flex justify-between gap-4 px-4 py-2"><span>Kandidat koreksi tanpa bukti/lampiran</span><b>{r.needsDocuments.length}</b></li>
          <li className="flex justify-between gap-4 px-4 py-2"><span>Aset tetap yang datanya belum lengkap (tidak disusutkan)</span><Link className="font-bold underline" href="/akuntansi/aset-tetap">{r.fixedAssets.incomplete}</Link></li>
          <li className="flex justify-between gap-4 px-4 py-2"><span>Saldo awal persediaan</span><b className="text-amber-700">{r.stock.openingOriginal ? "Belum diketahui sumbernya" : "-"}</b></li>
        </ul>
        {r.cogs.incomplete.length > 0 && (
          <details className="border-t border-slate-200 px-4 py-2 text-sm">
            <summary className="cursor-pointer font-semibold text-slate-700">Lihat penjualan dengan HPP belum lengkap</summary>
            <ul className="mt-2 space-y-1 text-xs">
              {r.cogs.incomplete.slice(0, 50).map((s) => <li key={s.id}><Link className="underline" href={`/penjualan/${s.id}`}>{s.number ?? s.id}</Link> · {s.date} · {s.customer} · {s.note}</li>)}
            </ul>
          </details>
        )}
      </section>

      <section className="aj-surface grid gap-4 p-4 text-sm lg:grid-cols-2">
        <div>
          <h3 className="font-semibold text-slate-900">Kebijakan</h3>
          <ul className="mt-2 space-y-1 text-slate-700">
            <li>Penilaian persediaan: <b>FIFO</b> per barang untuk seluruh usaha. Transfer antar lokasi tidak mengubah nilai.</li>
            <li>Biaya barang = harga beli × kurs + ongkir CBM + biaya lain sampai barang siap dijual. Ongkir ke pelanggan adalah biaya operasional.</li>
            <li>HPP diakui saat stok keluar untuk penjualan. Tanpa modal, HPP ditandai belum lengkap.</li>
            <li>Barang titipan pihak lain tidak dicatat di stok SLM.</li>
            <li>Aset tetap: ≥ {rp(r.policy.capitalizationThreshold)}, {r.policy.defaultUsefulLifeMonths} bulan, garis lurus. <Link className="underline" href="/akuntansi/aset-tetap">Atur</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">Status pajak</h3>
          <p className="mt-1 text-slate-700">
            {r.tax ? <>{r.tax.status === "NON_PKP" ? "Non-PKP" : "PKP"} sejak <b>{r.tax.effectiveDate}</b> · diverifikasi {r.tax.verifiedBy}</> : <span className="font-semibold text-amber-700">Belum diverifikasi. Sampai diisi, aturan PPN lama tetap berlaku.</span>}
          </p>
          <p className="mt-1 text-xs text-slate-500">Non-PKP: penjualan tanpa PPN keluaran; PPN pembelian/impor masuk ke biaya barang atau aset. PPh diatur terpisah.</p>
          {canManage && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <select className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm" value={taxStatus} onChange={(e) => setTaxStatus(e.target.value as "NON_PKP" | "PKP")}><option value="NON_PKP">Non-PKP</option><option value="PKP">PKP</option></select>
              <label className="text-xs font-semibold text-slate-700">Berlaku sejak<input type="date" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm" value={taxDate} onChange={(e) => setTaxDate(e.target.value)} /></label>
              <Button variant="secondary" className="min-h-10" disabled={!taxDate || busy !== null} onClick={() => act("tax", { action: "save_tax_status", status: taxStatus, effectiveDate: taxDate })}>Simpan</Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
