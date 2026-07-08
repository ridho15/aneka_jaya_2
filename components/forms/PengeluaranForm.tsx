"use client";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { pengeluaranSchema, type PengeluaranInput } from "@/lib/validation/pengeluaranSchema";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { FileUpload } from "@/components/ui/FileUpload";
import { Toast } from "@/components/ui/Toast";
import { AttachmentPreview } from "@/components/attachments/AttachmentPreview";
import { LocalAttachmentPreview } from "@/components/attachments/LocalAttachmentPreview";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BookkeepingType, RekeningAccount } from "@/lib/business/masterData";
import type { Expense } from "@/lib/types/expenses";
import { useRouter } from "next/navigation";

const today = new Date().toISOString().slice(0, 10);

type Props = { tipes: BookkeepingType[]; rekenings: RekeningAccount[]; expense?: Expense };
type CreatedExpense = { id: string; approvalStatus?: string; erpSyncTarget?: "local" | "erp"; erpSyncStatus?: string; erpReference?: string; retryable?: boolean };

export function PengeluaranForm({ tipes, rekenings, expense }: Props) {
  const router = useRouter();
  const isEdit = Boolean(expense);
  const activeTipes = useMemo(() => tipes.filter((t) => t.isActive), [tipes]);
  const defaultTipe = useMemo(() => expense ? activeTipes.find((tipe) => tipe.id === expense.tipeId || tipe.code === expense.tipeCodeSnapshot) || activeTipes[0] || { id: expense.tipeId || "W", code: expense.tipeCodeSnapshot || "W", name: expense.tipeNameSnapshot || "W", isActive: true, sortOrder: 1 } : activeTipes[0] ?? { id: "W", code: "W", name: "W", isActive: true, sortOrder: 1 }, [activeTipes, expense]);
  const rekeningForTipe = useCallback((selectedTipeId: string) => rekenings.filter((r) => r.tipeIds.includes(selectedTipeId)), [rekenings]);
  const defaultRekening = useMemo(() => {
    if (expense?.rekeningId) {
      const expenseRekening = rekenings.find((rekening) => rekening.id === expense.rekeningId && rekening.tipeIds.includes(defaultTipe.id));
      if (expenseRekening) return expenseRekening;
    }
    return rekeningForTipe(defaultTipe.id)[0];
  }, [defaultTipe.id, expense?.rekeningId, rekeningForTipe, rekenings]);
  const initialTipeRef = useRef(expense?.tipeId || defaultTipe.id);

  const [file, setFile] = useState<File>();
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string }>();
  const [createdExpense, setCreatedExpense] = useState<CreatedExpense>();
  const [filteredRekenings, setFilteredRekenings] = useState<RekeningAccount[]>(rekeningForTipe(defaultTipe.id));

  const { register, handleSubmit, reset, watch, setValue, getValues, formState: { errors, isSubmitting } } = useForm<PengeluaranInput>({
    resolver: zodResolver(pengeluaranSchema),
    defaultValues: {
      expenseDate: expense?.expenseDate || today, tipeId: expense?.tipeId || defaultTipe.id, tipeCodeSnapshot: expense?.tipeCodeSnapshot || defaultTipe.code, tipeNameSnapshot: expense?.tipeNameSnapshot || defaultTipe.name,
      rekeningId: expense?.rekeningId || defaultRekening?.id || "", rekeningNameSnapshot: expense?.rekeningNameSnapshot || defaultRekening?.name || "",
      coaId: expense?.coaId || "Kas", coaNameSnapshot: expense?.coaNameSnapshot || "Kas", category: expense?.category || "", vendorName: expense?.vendorName || "", description: expense?.description || "", amount: expense?.amount || 0, paymentMethod: expense?.paymentMethod || "", attachmentUrl: expense?.attachmentUrl || "", notes: expense?.notes || ""
    }
  });

  const tipeId = watch("tipeId");
  const amount = watch("amount");

  useEffect(() => {
    const tipe = activeTipes.find((t) => t.id === tipeId) ?? activeTipes[0];
    if (!tipe) return;
    setValue("tipeCodeSnapshot", tipe.code);
    setValue("tipeNameSnapshot", tipe.name);
    const reks = rekeningForTipe(tipe.id);
    setFilteredRekenings(reks);
    const currentRekening = reks.find((rekening) => rekening.id === getValues("rekeningId"));
    if (isEdit && initialTipeRef.current === tipe.id && currentRekening) {
      setValue("rekeningNameSnapshot", currentRekening.name);
      return;
    }
    const first = reks[0];
    if (first) { setValue("rekeningId", first.id); setValue("rekeningNameSnapshot", first.name); }
    initialTipeRef.current = tipe.id;
  }, [activeTipes, getValues, isEdit, rekeningForTipe, setValue, tipeId]);

  const submit = async (data: PengeluaranInput) => {
    setNotice(undefined);
    setCreatedExpense(undefined);
    let attachmentUrl = data.attachmentUrl;
    if (file) {
      const body = new FormData(); body.append("file", file);
      const upload = await fetch("/api/upload", { method: "POST", body });
      const uploadResult = await upload.json();
      if (!upload.ok || !uploadResult.success) { setNotice({ type: "error", message: uploadResult.message || "Bukti pembayaran gagal diunggah." }); return; }
      attachmentUrl = uploadResult.data.url;
    }
    const response = await fetch(isEdit && expense ? `/api/expenses/${encodeURIComponent(expense.id)}` : "/api/expenses", { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, attachmentUrl }) });
    const result = await response.json();
    if (!response.ok || !result.success) { setNotice({ type: "error", message: result.message || "Data gagal dikirim ke ERP." }); return; }
    if (isEdit) {
      setNotice({ type: "success", message: "Data pengeluaran berhasil diperbarui." });
      setTimeout(() => router.push("/pengeluaran"), 700);
      return;
    }
    const defaultRek = rekeningForTipe(defaultTipe.id)[0];
    reset({ expenseDate: today, tipeId: defaultTipe.id, tipeCodeSnapshot: defaultTipe.code, tipeNameSnapshot: defaultTipe.name, rekeningId: defaultRek?.id || "", rekeningNameSnapshot: defaultRek?.name || "", coaId: "Kas", coaNameSnapshot: "Kas", amount: 0, attachmentUrl: "" });
    setFile(undefined);
    if (result.data?.id) setCreatedExpense({
      id: String(result.data.id),
      approvalStatus: result.data.approvalStatus,
      erpSyncTarget: result.data.erpSyncTarget,
      erpSyncStatus: result.data.erpSyncStatus,
      erpReference: result.data.erpReference,
      retryable: result.data.retryable
    });
    setNotice({ type: "success", message: result.data?.approvalStatus === "pending_approval" ? "Data berhasil disimpan dan menunggu approval." : "Data pengeluaran berhasil disimpan." });
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-6">
      {notice && <Toast {...notice} />}
      {createdExpense && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {createdExpense.erpReference && <p className="mb-2">Referensi ERP: <code>{createdExpense.erpReference}</code></p>}
          <div className="flex flex-wrap gap-3">
            <Link href={`/pengeluaran/${createdExpense.id}`} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">
              Lihat Pengeluaran
            </Link>
            <Link href={`/print/expenses/${createdExpense.id}`} className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100">
              Cetak Pengeluaran
            </Link>
            <button type="button" onClick={() => setCreatedExpense(undefined)} className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100">
              Input Lagi
            </button>
            {createdExpense.erpSyncTarget === "erp" && createdExpense.erpSyncStatus === "failed" && (
              <Link href="/erp-sync" className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100">
                Lihat ERP Sync
              </Link>
            )}
          </div>
        </div>
      )}
      <p className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-orange-800">Pengeluaran AJ disinkronkan ke ERP sebagai <b>command Kas & Bank</b>. Status sukses hanya diberikan jika ERP merespons berhasil.</p>
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
          <Field label="Jumlah" error={errors.amount?.message}>
            <MoneyInput
              value={amount}
              min={1}
              onValueChange={(value) => setValue("amount", value, { shouldDirty: true, shouldValidate: true })}
            />
          </Field>
          <Field label="Metode pembayaran" error={errors.paymentMethod?.message}>
            <Select {...register("paymentMethod")}><option value="">Pilih metode</option><option>Transfer</option><option>Tunai</option><option>QRIS</option><option>Kartu</option></Select>
          </Field>
          <Field label="Upload bukti pembayaran">
            {isEdit && expense?.attachmentUrl && (
              <>
                <AttachmentPreview url={expense.attachmentUrl} label="Lampiran lama" className="mb-2" />
                <p className="mb-2 text-xs text-slate-500">Biarkan kosong jika tidak ingin mengganti lampiran.</p>
              </>
            )}
            <FileUpload onFileChange={setFile} />
            <LocalAttachmentPreview file={file} />
          </Field>
          <div className="md:col-span-2"><Field label="Deskripsi" error={errors.description?.message}><Textarea rows={3} {...register("description")} /></Field></div>
          <div className="md:col-span-2"><Field label="Catatan"><Textarea rows={2} placeholder="Opsional" {...register("notes")} /></Field></div>
        </div>
      </section>
      <div className="sticky bottom-3 z-20 rounded-md border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur md:static md:flex md:justify-end md:border-0 md:bg-transparent md:p-0 md:shadow-none">
        <Button type="submit" className="w-full md:w-auto" disabled={isSubmitting}>{isSubmitting ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Simpan Pengeluaran"}</Button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">{label}</span>{children}{error && <span className="mt-1 block text-xs font-normal text-red-600">{error}</span>}</label>;
}
