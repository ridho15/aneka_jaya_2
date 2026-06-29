"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { pengeluaranSchema, type PengeluaranInput } from "@/lib/validation/pengeluaranSchema";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { FileUpload } from "@/components/ui/FileUpload";
import { Toast } from "@/components/ui/Toast";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BookkeepingType, RekeningAccount } from "@/lib/business/masterData";

const today = new Date().toISOString().slice(0, 10);

type Props = { tipes: BookkeepingType[]; rekenings: RekeningAccount[] };

export function PengeluaranForm({ tipes, rekenings }: Props) {
  const activeTipes = useMemo(() => tipes.filter((t) => t.isActive), [tipes]);
  const defaultTipe = useMemo(() => activeTipes[0] ?? { id: "W", code: "W", name: "W", isActive: true, sortOrder: 1 }, [activeTipes]);
  const rekeningForTipe = useCallback((selectedTipeId: string) => rekenings.filter((r) => r.tipeIds.includes(selectedTipeId)), [rekenings]);
  const defaultRekening = useMemo(() => rekeningForTipe(defaultTipe.id)[0], [defaultTipe.id, rekeningForTipe]);

  const [file, setFile] = useState<File>();
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string }>();
  const [filteredRekenings, setFilteredRekenings] = useState<RekeningAccount[]>(rekeningForTipe(defaultTipe.id));

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<PengeluaranInput>({
    resolver: zodResolver(pengeluaranSchema),
    defaultValues: {
      expenseDate: today, tipeId: defaultTipe.id, tipeCodeSnapshot: defaultTipe.code, tipeNameSnapshot: defaultTipe.name,
      rekeningId: defaultRekening?.id || "", rekeningNameSnapshot: defaultRekening?.name || "",
      coaId: "Kas", coaNameSnapshot: "Kas", amount: 0, attachmentUrl: ""
    }
  });

  const tipeId = watch("tipeId");

  useEffect(() => {
    const tipe = activeTipes.find((t) => t.id === tipeId) ?? activeTipes[0];
    if (!tipe) return;
    setValue("tipeCodeSnapshot", tipe.code);
    setValue("tipeNameSnapshot", tipe.name);
    const reks = rekeningForTipe(tipe.id);
    setFilteredRekenings(reks);
    const first = reks[0];
    if (first) { setValue("rekeningId", first.id); setValue("rekeningNameSnapshot", first.name); }
  }, [activeTipes, rekeningForTipe, setValue, tipeId]);

  const submit = async (data: PengeluaranInput) => {
    setNotice(undefined);
    let attachmentUrl = data.attachmentUrl;
    if (file) {
      const body = new FormData(); body.append("file", file);
      const upload = await fetch("/api/upload", { method: "POST", body });
      const uploadResult = await upload.json();
      if (!upload.ok || !uploadResult.success) { setNotice({ type: "error", message: uploadResult.message || "Bukti pembayaran gagal diunggah." }); return; }
      attachmentUrl = uploadResult.data.url;
    }
    const response = await fetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, attachmentUrl }) });
    const result = await response.json();
    if (!response.ok || !result.success) { setNotice({ type: "error", message: result.message || "Data gagal dikirim ke ERP." }); return; }
    const defaultRek = rekeningForTipe(defaultTipe.id)[0];
    reset({ expenseDate: today, tipeId: defaultTipe.id, tipeCodeSnapshot: defaultTipe.code, tipeNameSnapshot: defaultTipe.name, rekeningId: defaultRek?.id || "", rekeningNameSnapshot: defaultRek?.name || "", coaId: "Kas", coaNameSnapshot: "Kas", amount: 0, attachmentUrl: "" });
    setFile(undefined);
    setNotice({ type: "success", message: result.data?.approvalStatus === "pending_approval" ? "Data berhasil disimpan dan menunggu approval." : "Data pengeluaran berhasil disimpan." });
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-6">
      {notice && <Toast {...notice} />}
      <p className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-orange-800">Tujuan ERP: <b>Buat Transaksi Kas & Bank</b>, transaksi keluar pada COA <b>Kas</b>.</p>
      <section className="aj-surface p-5 sm:p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Tanggal pengeluaran" error={errors.expenseDate?.message}><Input type="date" {...register("expenseDate")} /></Field>
          <Field label="Tipe" error={errors.tipeId?.message}>
            <Select {...register("tipeId")}>
              {activeTipes.map((t) => <option key={t.id} value={t.id}>{t.code}</option>)}
            </Select>
          </Field>
          <Field label="Rekening pembayaran" error={errors.rekeningId?.message}>
            <Select {...register("rekeningId")} onChange={(event) => { setValue("rekeningId", event.target.value); setValue("rekeningNameSnapshot", event.currentTarget.selectedOptions[0]?.text || event.target.value); }}>
              {filteredRekenings.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              {filteredRekenings.length === 0 && <option value="">— tidak ada rekening untuk tipe ini —</option>}
            </Select>
            {filteredRekenings.length === 0 && <span className="mt-1 block text-xs font-normal text-amber-700">Belum ada rekening untuk tipe ini. Tambah di Pengaturan → Rekening.</span>}
          </Field>
          <Field label="COA" error={errors.coaId?.message}>
            <Select {...register("coaId")} onChange={(event) => { setValue("coaId", event.target.value); setValue("coaNameSnapshot", event.currentTarget.selectedOptions[0]?.text || event.target.value); }}>
              <option value="Kas">Kas</option><option value="Operasional">Operasional</option><option value="Transport">Transport</option><option value="Pembelian">Pembelian</option>
            </Select>
          </Field>
          <Field label="Kategori pengeluaran" error={errors.category?.message}><Input placeholder="Contoh: Operasional" {...register("category")} /></Field>
          <Field label="Nama vendor / penerima" error={errors.vendorName?.message}><Input {...register("vendorName")} /></Field>
          <Field label="Jumlah" error={errors.amount?.message}><Input type="number" min="1" inputMode="numeric" {...register("amount", { valueAsNumber: true })} /></Field>
          <Field label="Metode pembayaran" error={errors.paymentMethod?.message}>
            <Select {...register("paymentMethod")}><option value="">Pilih metode</option><option>Transfer</option><option>Tunai</option><option>QRIS</option><option>Kartu</option></Select>
          </Field>
          <Field label="Upload bukti pembayaran"><FileUpload onFileChange={setFile} /></Field>
          <div className="md:col-span-2"><Field label="Deskripsi" error={errors.description?.message}><Textarea rows={3} {...register("description")} /></Field></div>
          <div className="md:col-span-2"><Field label="Catatan"><Textarea rows={2} placeholder="Opsional" {...register("notes")} /></Field></div>
        </div>
      </section>
      <div className="flex justify-end"><Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Menyimpan..." : "Simpan Pengeluaran"}</Button></div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">{label}</span>{children}{error && <span className="mt-1 block text-xs font-normal text-red-600">{error}</span>}</label>;
}
