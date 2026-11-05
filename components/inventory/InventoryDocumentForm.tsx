"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useToast } from "@/components/ui/ToastProvider";
import { koliText, koliToQty, locationLabel, qtyToKoliFields, type InvLocation, type InvProduct } from "./labels";
import { useRememberedLocation } from "./rememberedLocation";

type Mode = "transfer" | "opname" | "adjustment" | "stock-in";
type Row = { productId: string; koli: string; loose: string; unitCost: string; notes: string };
type Snapshot = { locationId: string; status: "loading" | "ready" | "error"; qty: Record<string, number> };

const ENDPOINT: Record<Mode, string> = {
  transfer: "/api/inventory/transfers",
  opname: "/api/inventory/opnames",
  adjustment: "/api/inventory/adjustments",
  "stock-in": "/api/inventory/stock-in"
};

const QTY_LABEL: Record<Mode, string> = {
  transfer: "Jumlah dipindah",
  opname: "Jumlah fisik (hasil hitung)",
  adjustment: "Jumlah (isi minus untuk mengurangi)",
  "stock-in": "Jumlah masuk"
};

const SUBMIT_LABEL: Record<Mode, string> = {
  transfer: "Simpan Transfer",
  opname: "Simpan Opname",
  adjustment: "Simpan Adjustment",
  "stock-in": "Simpan Barang Masuk"
};

export const fieldClass =
  "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1";

type Props = { mode: Mode; locations: InvLocation[]; products: InvProduct[]; initialLocationId?: string; initialProductId?: string };

const emptyRow = (productId: string): Row => ({ productId, koli: "", loose: "", unitCost: "", notes: "" });

const qtyField = fieldClass.replace("w-full ", "");
// Satu baris per barang di layar lebar; kelas ditulis utuh agar terbaca Tailwind.
const GRID = "md:grid-cols-[minmax(160px,1.4fr)_minmax(90px,0.6fr)_auto_minmax(110px,0.6fr)_minmax(120px,1fr)_auto]";
const GRID_COST = "md:grid-cols-[minmax(160px,1.4fr)_minmax(90px,0.6fr)_auto_minmax(90px,0.5fr)_minmax(100px,0.6fr)_minmax(110px,0.8fr)_auto]";

export function InventoryDocumentForm({ mode, locations, products, initialLocationId, initialProductId }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const locationIds = useMemo(() => locations.map((l) => l.id), [locations]);
  const validInitial = initialLocationId && locationIds.includes(initialLocationId) ? initialLocationId : "";
  const [locationId, setLocationId] = useRememberedLocation(mode, locationIds, validInitial);
  const [toLocationId, setToLocationId] = useRememberedLocation("transfer-to", locationIds);
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [receiveNow, setReceiveNow] = useState(true);
  const [rows, setRows] = useState<Row[]>(() => {
    const p = products.find((x) => x.id === initialProductId);
    return p ? [emptyRow(p.id)] : [];
  });
  const [rowFilter, setRowFilter] = useState("");
  const [filling, setFilling] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot>({ locationId: "", status: "ready", qty: {} });
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stok sistem hanya dipercaya bila sudah dimuat untuk lokasi yang sedang dipilih.
  const stockStatus: Snapshot["status"] | "idle" = !locationId ? "idle" : snapshot.locationId === locationId ? snapshot.status : "loading";
  const systemQty = useMemo<Record<string, number>>(() => (stockStatus === "ready" ? snapshot.qty : {}), [stockStatus, snapshot.qty]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const productOptions = useMemo(
    () => products.filter((p) => !rows.some((r) => r.productId === p.id)).map((p) => ({
      value: p.id,
      label: p.name,
      badge: p.sku,
      description: `${p.unit}${p.unitsPerKoli ? ` · isi ${p.unitsPerKoli} ${p.unit}/koli` : ""}${stockStatus === "ready" ? ` · stok: ${koliText(systemQty[p.id] ?? 0, p.unitsPerKoli, p.unit)}` : ""}`
    })),
    [products, rows, systemQty, stockStatus]
  );

  useEffect(() => {
    if (!locationId) return;
    let active = true;
    fetch(`/api/inventory/stocks?locationId=${encodeURIComponent(locationId)}&includeZero=1&pageSize=5000`)
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        if (!json.success) throw new Error(json.message);
        setSnapshot({ locationId, status: "ready", qty: Object.fromEntries((json.data as { productId: string; quantity: number }[]).map((b) => [b.productId, b.quantity])) });
      })
      .catch(() => {
        if (active) setSnapshot({ locationId, status: "error", qty: {} });
      });
    return () => { active = false; };
  }, [locationId, reloadKey]);

  const prefilledRow = (p: InvProduct, quantity: number): Row => ({ ...emptyRow(p.id), ...qtyToKoliFields(quantity, p.unitsPerKoli) });

  /** Opname: semua barang yang ada stoknya di lokasi ini langsung masuk daftar berisi stok sistem. */
  function loadAllForOpname() {
    const taken = new Set(rows.map((r) => r.productId));
    const added = products.filter((p) => !taken.has(p.id) && (systemQty[p.id] ?? 0) !== 0).map((p) => prefilledRow(p, systemQty[p.id]));
    setRows((prev) => [...prev, ...added]);
    showToast(added.length ? `${added.length} barang dimuat. Ubah hanya yang jumlahnya beda.` : "Tidak ada barang lain yang punya stok di lokasi ini.", added.length ? "success" : "info");
  }

  /** Transfer: isi barang yang di tujuan tinggal 1 koli atau kurang, 1 koli per barang (atau sisa stok asal). */
  async function fillLowAtDestination() {
    if (!toLocationId || stockStatus !== "ready") return;
    setFilling(true);
    try {
      const res = await fetch(`/api/inventory/stocks?locationId=${encodeURIComponent(toLocationId)}&includeZero=1&pageSize=5000`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      const dest = Object.fromEntries((json.data as { productId: string; quantity: number }[]).map((b) => [b.productId, b.quantity]));
      const taken = new Set(rows.map((r) => r.productId));
      const added = products
        .filter((p) => !taken.has(p.id) && p.unitsPerKoli && (systemQty[p.id] ?? 0) > 0 && (dest[p.id] ?? 0) <= p.unitsPerKoli)
        .map((p) => prefilledRow(p, Math.min(p.unitsPerKoli!, systemQty[p.id])));
      setRows((prev) => [...prev, ...added]);
      showToast(added.length ? `${added.length} barang menipis di tujuan ditambahkan. Cek jumlahnya sebelum simpan.` : "Tidak ada barang menipis di tujuan yang stoknya tersedia di asal.", added.length ? "success" : "info");
    } catch {
      showToast("Stok lokasi tujuan gagal dimuat. Coba lagi.", "error");
    } finally {
      setFilling(false);
    }
  }

  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
  const rowQty = (row: Row) => {
    const koli = numOrNull(row.koli);
    const perKoli = productMap.get(row.productId)?.unitsPerKoli ?? null;
    if (koli == null && numOrNull(row.loose) == null) return NaN;
    if (koli && !(perKoli && perKoli > 0)) return NaN;
    return koliToQty(row.koli, row.loose, perKoli);
  };

  const updateRow = (index: number, patch: Partial<Row>) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  function validate() {
    if (!locationId) return mode === "transfer" ? "Pilih lokasi asal." : "Pilih gudang atau toko.";
    if (mode === "transfer" && !toLocationId) return "Pilih lokasi tujuan.";
    if (mode === "adjustment" && reason.trim().length < 3) return "Alasan adjustment wajib diisi.";
    if (!rows.length) return "Tambahkan minimal satu barang.";
    const bad = rows.find((r) => !Number.isFinite(rowQty(r)));
    if (bad) {
      const sku = productMap.get(bad.productId)?.sku ?? "";
      return numOrNull(bad.koli) && !productMap.get(bad.productId)?.unitsPerKoli ? `Isi per koli ${sku} belum diatur di Master Barang. Isi jumlahnya di kolom lepas.` : `Jumlah ${sku} wajib diisi (koli dan/atau lepas).`;
    }
    if (mode === "opname" && stockStatus !== "ready") return "Stok sistem belum termuat. Tunggu sebentar atau muat ulang sebelum menyimpan opname.";
    return null;
  }

  function requestSubmit() {
    const problem = validate();
    setError(problem);
    if (problem) return;
    if (mode === "opname") setConfirmOpen(true);
    else void submit();
  }

  async function submit() {
    const items = rows.map((r) => {
      const base = {
        productId: r.productId,
        notes: r.notes || undefined,
        koli: numOrNull(r.koli) ?? undefined,
        loose: numOrNull(r.loose) ?? undefined
      };
      return mode === "opname" ? base : { ...base, unitCost: r.unitCost ? Number(r.unitCost) : undefined };
    });
    const body: Record<string, unknown> = { notes: notes || undefined, items, idempotencyKey: crypto.randomUUID() };
    if (mode === "transfer") Object.assign(body, { fromLocationId: locationId, toLocationId, transferDate: date, receiveNow });
    if (mode === "opname") Object.assign(body, { locationId, opnameDate: date });
    if (mode === "adjustment") Object.assign(body, { locationId, adjustmentDate: date, reason });
    if (mode === "stock-in") Object.assign(body, { locationId, movementDate: date, referenceNumber: reference || undefined });

    setSubmitting(true);
    try {
      const response = await fetch(ENDPOINT[mode], { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json();
      if (!json.success) {
        setError(json.message || "Gagal menyimpan.");
        return;
      }
      showToast("Tersimpan. Stok sudah diperbarui.", "success");
      setRows([]); setRowFilter(""); setNotes(""); setReason(""); setReference("");
      setReloadKey((k) => k + 1);
      router.refresh();
    } catch {
      setError("Koneksi terputus. Coba simpan lagi.");
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }

  const changedCount = rows.filter((r) => {
    const q = rowQty(r);
    return Number.isFinite(q) && Math.round((q - (systemQty[r.productId] ?? 0)) * 100) !== 0;
  }).length;

  const stockCell = (productId: string, unitsPerKoli: number | null | undefined, unit: string) => {
    if (stockStatus === "idle") return <span className="text-slate-500">Pilih lokasi</span>;
    if (stockStatus === "loading") return <span className="text-slate-500">Memuat…</span>;
    if (stockStatus === "error") {
      return (
        <button type="button" className="min-h-11 font-semibold text-red-700 underline" onClick={() => setReloadKey((k) => k + 1)}>
          Gagal dimuat, coba lagi
        </button>
      );
    }
    const sys = systemQty[productId] ?? 0;
    return <span title={`${sys.toLocaleString("id-ID")} ${unit}`}>{koliText(sys, unitsPerKoli, unit)}</span>;
  };

  const withCost = mode === "stock-in" || mode === "adjustment";
  const gridCols = withCost ? GRID_COST : GRID;

  return (
    // Pesan error lama hilang begitu pengguna mengubah isian.
    <div className="aj-surface space-y-5 p-4 sm:p-5" onChange={() => error && setError(null)}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm font-semibold text-slate-700">
          <span>{mode === "transfer" ? "Dari (asal)" : "Gudang / Toko"}</span>
          <select className={fieldClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">Pilih lokasi</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{locationLabel(l)}</option>)}
          </select>
        </label>
        {mode === "transfer" && (
          <label className="space-y-1 text-sm font-semibold text-slate-700">
            <span>Ke (tujuan)</span>
            <select className={fieldClass} value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
              <option value="">Pilih lokasi</option>
              {locations.filter((l) => l.id !== locationId).map((l) => <option key={l.id} value={l.id}>{locationLabel(l)}</option>)}
            </select>
          </label>
        )}
        <label className="space-y-1 text-sm font-semibold text-slate-700">
          <span>Tanggal</span>
          <input type="date" className={fieldClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {mode === "adjustment" && (
          <label className="space-y-1 text-sm font-semibold text-slate-700 sm:col-span-2">
            <span>Alasan</span>
            <input className={fieldClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. barang rusak, hilang, bonus supplier" />
          </label>
        )}
        {mode === "stock-in" && (
          <label className="space-y-1 text-sm font-semibold text-slate-700">
            <span>No. faktur / surat jalan (opsional)</span>
            <input className={fieldClass} value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
        )}
        {mode === "transfer" && (
          <label className="flex min-h-11 items-center gap-3 self-end text-sm font-semibold text-slate-700">
            <input type="checkbox" className="h-5 w-5" checked={receiveNow} onChange={(e) => setReceiveNow(e.target.checked)} />
            Langsung diterima di tujuan
          </label>
        )}
      </div>

      {mode === "opname" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Stock opname <b>mengganti</b> stok sistem dengan jumlah fisik yang Anda isi. Selisihnya otomatis tercatat di kartu stok.
        </p>
      )}

      {(mode === "opname" || mode === "transfer") && locationId && (
        <div className="flex flex-wrap items-center gap-3">
          {mode === "opname" && (
            <Button type="button" variant="secondary" className="min-h-11" disabled={stockStatus !== "ready"} onClick={loadAllForOpname}>
              Muat semua barang di lokasi ini
            </Button>
          )}
          {mode === "transfer" && (
            <Button type="button" variant="secondary" className="min-h-11" disabled={!toLocationId || stockStatus !== "ready" || filling} onClick={fillLowAtDestination}>
              {filling ? "Memuat..." : "Isi barang yang menipis di tujuan"}
            </Button>
          )}
          <span className="text-sm text-slate-600">
            {mode === "opname" ? "Isi otomatis dengan stok sistem, lalu ubah hanya yang hasil hitungnya beda." : "Barang yang di tujuan tinggal 1 koli atau kurang, diisi 1 koli."}
          </span>
        </div>
      )}

      {rows.length > 10 && (
        <label className="block text-sm font-semibold text-slate-700 sm:w-96">
          <span>Cari di daftar ({rows.length} barang)</span>
          <input className={`${fieldClass} mt-1`} value={rowFilter} onChange={(e) => setRowFilter(e.target.value)} placeholder="Kode / nama barang" />
        </label>
      )}

      {rows.length > 0 && (
        <div className="rounded-lg border border-slate-200">
          <div className={`hidden gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 md:grid ${gridCols}`}>
            <span>Barang</span>
            <span className="text-right">Stok sistem</span>
            <span>{QTY_LABEL[mode]}</span>
            <span className="text-right">{mode === "opname" ? "Total · selisih" : "Total"}</span>
            {withCost && <span>HPP per satuan (opsional)</span>}
            <span>Catatan</span>
            <span />
          </div>
          <ul className="divide-y divide-slate-200">
            {rows.map((row, i) => {
              const p = productMap.get(row.productId);
              const needle = rowFilter.trim().toLowerCase();
              if (needle && !`${p?.sku} ${p?.name}`.toLowerCase().includes(needle)) return null;
              const unit = p?.unit ?? "";
              const perKoli = p?.unitsPerKoli ?? null;
              const q = rowQty(row);
              const sys = systemQty[row.productId] ?? 0;
              const diff = stockStatus === "ready" && Number.isFinite(q) ? Math.round((q - sys) * 100) / 100 : null;
              const name = p?.name ?? row.productId;
              return (
                <li key={row.productId} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2 ${gridCols}`}>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-900" title={name}>{name}</div>
                    <div className="hidden truncate text-xs text-slate-600 md:block">
                      {p?.sku} · {perKoli ? `isi ${perKoli.toLocaleString("id-ID")} ${unit}/koli` : `${unit} · isi per koli belum diatur`}
                    </div>
                    <div className="truncate text-xs text-slate-600 md:hidden">
                      {p?.sku} · {perKoli ? `${perKoli.toLocaleString("id-ID")}/koli` : "tanpa koli"} · stok {stockCell(row.productId, perKoli, unit)}
                    </div>
                  </div>
                  <div className="hidden whitespace-nowrap text-right text-sm tabular-nums md:block">{stockCell(row.productId, perKoli, unit)}</div>
                  <div className="col-span-2 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-slate-700 md:col-span-1 md:flex-nowrap">
                    <input
                      aria-label={`Koli ${p?.sku ?? ""}`}
                      className={`${qtyField} w-16 disabled:bg-slate-100`}
                      inputMode="decimal"
                      placeholder={perKoli ? "0" : "–"}
                      disabled={!perKoli}
                      title={perKoli ? undefined : "Isi per koli belum diatur di Master Barang"}
                      value={row.koli}
                      onChange={(e) => updateRow(i, { koli: e.target.value })}
                    />
                    <span>koli +</span>
                    <input
                      aria-label={`Lepas ${p?.sku ?? ""} (${unit})`}
                      className={`${qtyField} w-20`}
                      inputMode="decimal"
                      placeholder="0"
                      value={row.loose}
                      onChange={(e) => updateRow(i, { loose: e.target.value })}
                    />
                    <span>{unit}</span>
                    <span className="whitespace-nowrap text-xs text-slate-600 md:hidden">
                      {Number.isFinite(q) ? <>= <b>{q.toLocaleString("id-ID")}</b></> : null}
                      {mode === "opname" && diff != null && diff !== 0 ? <> (<b className={diff < 0 ? "text-red-700" : "text-emerald-800"}>{diff > 0 ? "+" : ""}{diff.toLocaleString("id-ID")}</b>)</> : null}
                    </span>
                  </div>
                  <div className="hidden whitespace-nowrap text-right text-sm tabular-nums md:block">
                    {Number.isFinite(q) ? <b>{q.toLocaleString("id-ID")} {unit}</b> : <span className="text-slate-500">–</span>}
                    {mode === "opname" && diff != null ? <span className={`ml-1 font-semibold ${diff < 0 ? "text-red-700" : diff > 0 ? "text-emerald-800" : "text-slate-500"}`}>{diff > 0 ? "+" : ""}{diff.toLocaleString("id-ID")}</span> : null}
                  </div>
                  {withCost && (
                    <input aria-label={`HPP per ${unit || "satuan"} ${p?.sku ?? ""} (opsional)`} placeholder="HPP (opsional)" className={`${fieldClass} hidden md:block`} inputMode="decimal" value={row.unitCost} onChange={(e) => updateRow(i, { unitCost: e.target.value })} />
                  )}
                  <input aria-label={`Catatan ${p?.sku ?? ""}`} placeholder="Catatan" className={`${fieldClass} hidden md:block`} value={row.notes} onChange={(e) => updateRow(i, { notes: e.target.value })} />
                  <button type="button" aria-label={`Hapus ${p?.sku ?? ""}`} className="col-start-2 row-start-1 min-h-11 rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-50 md:col-start-auto md:row-start-auto" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}>
                    Hapus
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="w-full sm:w-96">
        <SearchableSelect
          options={productOptions}
          onSelect={(productId) => {
            setError(null);
            setRows((prev) => [...prev, emptyRow(productId)]);
          }}
          placeholder="+ Tambah barang"
          searchPlaceholder="Cari kode / nama barang..."
          emptyText="Barang tidak ditemukan. Minta Super Admin menambahkannya di Master Barang."
          buttonClassName="min-h-11"
        />
      </div>

      <label className="block space-y-1 text-sm font-semibold text-slate-700">
        <span>Catatan</span>
        <textarea className={fieldClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex justify-end">
        <Button type="button" className="min-h-11 px-5" onClick={requestSubmit} disabled={submitting}>{submitting ? "Menyimpan..." : SUBMIT_LABEL[mode]}</Button>
      </div>

      <ConfirmationModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={submit}
        isLoading={submitting}
        variant="warning"
        title="Simpan opname?"
        description={`${rows.length} barang dicek, ${changedCount} barang jumlahnya berubah. Stok sistem diganti dengan jumlah fisik; barang yang tidak berubah tercatat cocok.`}
        confirmText="Ya, simpan opname"
      />
    </div>
  );
}
