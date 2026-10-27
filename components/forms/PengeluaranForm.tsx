"use client";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { pengeluaranSchema, type PengeluaranInput, EXPENSE_CATEGORIES, labelForCategoryCode, type ExpenseCategoryCode } from "@/lib/validation/pengeluaranSchema";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { FileUpload } from "@/components/ui/FileUpload";
import { Toast } from "@/components/ui/Toast";
import { AttachmentPreview } from "@/components/attachments/AttachmentPreview";
import { LocalAttachmentPreview } from "@/components/attachments/LocalAttachmentPreview";
import { ExpenseJournalPreview } from "@/components/forms/ExpenseJournalPreview";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BookkeepingType, RekeningAccount } from "@/lib/business/masterData";
import type { Expense } from "@/lib/types/expenses";
import { useRouter } from "next/navigation";
import { jakartaDateKey } from "@/lib/date/jakarta";

const todayJakarta = () => jakartaDateKey();
const currentMonthJakarta = () => jakartaDateKey().slice(0, 7);

type EmployeeOption = { id: string; name: string; position: string; department: string };

type Props = {
  tipes: BookkeepingType[];
  rekenings: RekeningAccount[];
  expense?: Expense;
  employees?: EmployeeOption[];
};

type CreatedExpense = {
  id: string;
  approvalStatus?: string;
  erpSyncTarget?: "local" | "erp";
  erpSyncStatus?: string;
  erpReference?: string;
  retryable?: boolean;
};

export function PengeluaranForm({ tipes, rekenings, expense, employees = [] }: Props) {
  const router = useRouter();
  const isEdit = Boolean(expense);
  const activeTipes = useMemo(() => tipes.filter((t) => t.isActive), [tipes]);
  const defaultTipe = useMemo(
    () =>
      expense
        ? activeTipes.find((tipe) => tipe.id === expense.tipeId || tipe.code === expense.tipeCodeSnapshot) ||
          activeTipes[0] || { id: expense.tipeId || "W", code: expense.tipeCodeSnapshot || "W", name: expense.tipeNameSnapshot || "W", isActive: true, sortOrder: 1 }
        : activeTipes[0] ?? { id: "W", code: "W", name: "W", isActive: true, sortOrder: 1 },
    [activeTipes, expense]
  );
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

  const initialCategoryCode: ExpenseCategoryCode =
    (expense?.categoryCode as ExpenseCategoryCode) ||
    (expense?.category?.toLowerCase().includes("gaji")
      ? "salary"
      : expense?.category?.toLowerCase().includes("kasbon")
      ? "employee_loan"
      : expense?.category?.toLowerCase().includes("uang muka") || expense?.category?.toLowerCase().includes("advance")
      ? "operational_advance"
      : expense?.category?.toLowerCase().includes("pembelian")
      ? "goods_purchase"
      : "operational_expense");

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting }
  } = useForm<PengeluaranInput>({
    resolver: zodResolver(pengeluaranSchema),
    defaultValues: {
      expenseDate: expense?.expenseDate || todayJakarta(),
      tipeId: expense?.tipeId || defaultTipe.id,
      tipeCodeSnapshot: expense?.tipeCodeSnapshot || defaultTipe.code,
      tipeNameSnapshot: expense?.tipeNameSnapshot || defaultTipe.name,
      rekeningId: expense?.rekeningId || defaultRekening?.id || "",
      rekeningNameSnapshot: expense?.rekeningNameSnapshot || defaultRekening?.name || "",
      coaId: expense?.coaId || "Kas",
      coaNameSnapshot: expense?.coaNameSnapshot || "Kas",
      categoryCode: initialCategoryCode,
      category: expense?.category || labelForCategoryCode(initialCategoryCode),
      employeeId: expense?.employeeId || "",
      salaryPeriod: expense?.salaryPeriod || (initialCategoryCode === "salary" ? currentMonthJakarta() : ""),
      salaryPaymentType: (expense?.salaryPaymentType as "EXPENSE" | "PAYABLE") || "EXPENSE",
      dueDate: expense?.dueDate || "",
      purpose: expense?.purpose || "",
      vendorName: expense?.vendorName || "",
      description: expense?.description || "",
      amount: expense?.amount || 0,
      paymentMethod: expense?.paymentMethod || "",
      attachmentUrl: expense?.attachmentUrl || "",
      notes: expense?.notes || ""
    }
  });

  const tipeId = watch("tipeId");
  const amount = watch("amount");
  const categoryCode = watch("categoryCode");
  const employeeId = watch("employeeId");
  const salaryPaymentType = watch("salaryPaymentType");
  const rekeningNameSnapshot = watch("rekeningNameSnapshot");
  const vendorName = watch("vendorName");
  const salaryPeriod = watch("salaryPeriod");
  const purpose = watch("purpose");
  const coaId = watch("coaId");
  const coaNameSnapshot = watch("coaNameSnapshot");

  const selectedEmployee = useMemo(() => employees.find((e) => e.id === employeeId), [employees, employeeId]);

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
    if (first) {
      setValue("rekeningId", first.id);
      setValue("rekeningNameSnapshot", first.name);
    }
    initialTipeRef.current = tipe.id;
  }, [activeTipes, getValues, isEdit, rekeningForTipe, setValue, tipeId]);

  const handleCategoryChange = (newCode: ExpenseCategoryCode) => {
    setValue("categoryCode", newCode);
    setValue("category", labelForCategoryCode(newCode));
    if (newCode === "salary") {
      setValue("salaryPaymentType", "EXPENSE");
      setValue("coaId", "6-1002");
      setValue("coaNameSnapshot", "6-1002 Beban Gaji Karyawan");
      if (!getValues("salaryPeriod")) {
        setValue("salaryPeriod", currentMonthJakarta());
      }
    } else if (newCode === "employee_loan" || newCode === "operational_advance") {
      setValue("coaId", "Kas");
      setValue("coaNameSnapshot", "Kas");
    } else if (newCode === "goods_purchase") {
      setValue("coaId", "Pembelian");
      setValue("coaNameSnapshot", "Pembelian");
    }
  };

  const handleEmployeeChange = (selectedEmployeeId: string) => {
    setValue("employeeId", selectedEmployeeId);
    const selected = employees.find((e) => e.id === selectedEmployeeId);
    if (selected) {
      const currentVendor = getValues("vendorName");
      if (!currentVendor || employees.some((e) => e.name === currentVendor)) {
        setValue("vendorName", selected.name);
      }
      if (categoryCode === "employee_loan" && !getValues("description")) {
        setValue("description", `Kasbon karyawan: ${selected.name}`);
      } else if (categoryCode === "operational_advance" && !getValues("description")) {
        setValue("description", `Uang muka operasional: ${selected.name}`);
      } else if (categoryCode === "salary" && !getValues("description")) {
        const period = getValues("salaryPeriod") || currentMonthJakarta();
        setValue("description", `Pembayaran gaji ${selected.name} periode ${period}`);
      }
    }
  };

  const submit = async (data: PengeluaranInput) => {
    setNotice(undefined);
    setCreatedExpense(undefined);
    let attachmentUrl = data.attachmentUrl;
    if (file) {
      const body = new FormData();
      body.append("file", file);
      const upload = await fetch("/api/upload", { method: "POST", body });
      const uploadResult = await upload.json();
      if (!upload.ok || !uploadResult.success) {
        setNotice({ type: "error", message: uploadResult.message || "Bukti pembayaran gagal diunggah." });
        return;
      }
      attachmentUrl = uploadResult.data.url;
    }
    const response = await fetch(isEdit && expense ? `/api/expenses/${encodeURIComponent(expense.id)}` : "/api/expenses", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, attachmentUrl })
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      setNotice({ type: "error", message: result.message || "Data gagal dikirim ke ERP." });
      return;
    }
    if (isEdit) {
      setNotice({ type: "success", message: "Data pengeluaran berhasil diperbarui." });
      setTimeout(() => router.push("/pengeluaran"), 700);
      return;
    }
    const defaultRek = rekeningForTipe(defaultTipe.id)[0];
    reset({
      expenseDate: todayJakarta(),
      tipeId: defaultTipe.id,
      tipeCodeSnapshot: defaultTipe.code,
      tipeNameSnapshot: defaultTipe.name,
      rekeningId: defaultRek?.id || "",
      rekeningNameSnapshot: defaultRek?.name || "",
      coaId: "Kas",
      coaNameSnapshot: "Kas",
      categoryCode: "operational_expense",
      category: labelForCategoryCode("operational_expense"),
      employeeId: "",
      salaryPeriod: "",
      salaryPaymentType: "EXPENSE",
      dueDate: "",
      purpose: "",
      amount: 0,
      attachmentUrl: ""
    });
    setFile(undefined);
    if (result.data?.id) {
      const createdId = String(result.data.id);
      setCreatedExpense({
        id: createdId,
        approvalStatus: result.data.approvalStatus,
        erpSyncTarget: result.data.erpSyncTarget,
        erpSyncStatus: result.data.erpSyncStatus,
        erpReference: result.data.erpReference,
        retryable: result.data.retryable
      });
      setTimeout(() => {
        router.push(`/pengeluaran/${encodeURIComponent(createdId)}/invoice?created=1`);
      }, 600);
    }
    setNotice({
      type: "success",
      message:
        result.data?.approvalStatus === "pending_approval"
          ? "Data berhasil disimpan dan menunggu approval."
          : "Data pengeluaran berhasil disimpan."
    });
  };

  const isLoanOrAdvance = categoryCode === "employee_loan" || categoryCode === "operational_advance";
  const isSalary = categoryCode === "salary";

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-6">
      {notice && <Toast {...notice} />}
      {createdExpense && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {createdExpense.erpReference && (
            <p className="mb-2">
              Referensi ERP: <code>{createdExpense.erpReference}</code>
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/pengeluaran/${createdExpense.id}/invoice`}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition-colors"
            >
              Lihat Bukti (PNG / PDF)
            </Link>
            <Link
              href={`/pengeluaran/${createdExpense.id}`}
              className="rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 shadow-xs transition-colors"
            >
              Lihat Pengeluaran
            </Link>
            <Link
              href={`/print/expenses/${createdExpense.id}`}
              className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
            >
              Cetak Pengeluaran
            </Link>
            <button
              type="button"
              onClick={() => setCreatedExpense(undefined)}
              className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
            >
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

      {/* Category Accounting Guidance Alert */}
      {categoryCode === "employee_loan" && (
        <div className="rounded border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-950 flex items-start gap-3">
          <svg className="h-5 w-5 shrink-0 text-sky-700 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-semibold text-sky-900">Klasifikasi Akuntansi: Kasbon Pribadi Karyawan (Piutang Karyawan)</p>
            <p className="mt-1 text-xs text-sky-800 leading-relaxed">
              Dicatat sebagai <b>Aset Piutang Karyawan</b> dan otomatis masuk ke subledger SDM karyawan bersangkutan. Transaksi ini{" "}
              <b>tidak membebani laba rugi operasional</b> saat pencairan dana.
            </p>
          </div>
        </div>
      )}
      {categoryCode === "operational_advance" && (
        <div className="rounded border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 flex items-start gap-3">
          <svg className="h-5 w-5 shrink-0 text-amber-700 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-semibold text-amber-900">Klasifikasi Akuntansi: Uang Muka Operasional (Advance)</p>
            <p className="mt-1 text-xs text-amber-800 leading-relaxed">
              Dicatat sebagai uang muka operasional di SDM. Karyawan wajib mempertanggungjawabkan nota riil dan menyetorkan sisa kas kelebihan di menu SDM Uang Muka.
            </p>
          </div>
        </div>
      )}
      {categoryCode === "salary" && (
        <div className="rounded border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950 flex items-start gap-3">
          <svg className="h-5 w-5 shrink-0 text-emerald-700 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-semibold text-emerald-900">Klasifikasi Akuntansi: Gaji Karyawan</p>
            <p className="mt-1 text-xs text-emerald-800 leading-relaxed">
              Dicatat sebagai Beban Gaji periode bersangkutan dan tersimpan di riwayat penggajian SDM. Masukkan nominal bersih yang ditransfer ke rekening karyawan.
            </p>
          </div>
        </div>
      )}

      <section className="aj-surface p-5 sm:p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Tanggal pengeluaran" error={errors.expenseDate?.message}>
            <Input type="date" {...register("expenseDate")} />
          </Field>
          <Field label="Tipe" error={errors.tipeId?.message}>
            <Select {...register("tipeId")}>
              {activeTipes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Rekening pembayaran" error={errors.rekeningId?.message}>
            <Select
              {...register("rekeningId")}
              onChange={(event) => {
                setValue("rekeningId", event.target.value);
                setValue("rekeningNameSnapshot", event.currentTarget.selectedOptions[0]?.text || event.target.value);
              }}
            >
              {filteredRekenings.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
              {filteredRekenings.length === 0 && <option value="">— tidak ada rekening untuk tipe ini —</option>}
            </Select>
            {filteredRekenings.length === 0 && (
              <span className="mt-1 block text-xs font-normal text-amber-700">
                Belum ada rekening untuk tipe ini. Tambah di Pengaturan → Rekening.
              </span>
            )}
          </Field>
          <Field label="COA" error={errors.coaId?.message}>
            <Select
              {...register("coaId")}
              onChange={(event) => {
                setValue("coaId", event.target.value);
                setValue("coaNameSnapshot", event.currentTarget.selectedOptions[0]?.text || event.target.value);
              }}
            >
              <option value="Kas">Kas</option>
              <option value="Operasional">Operasional</option>
              <option value="Transport">Transport</option>
              <option value="Pembelian">Pembelian</option>
            </Select>
          </Field>

          {/* Kategori Pengeluaran (5 Stable Standard Options) */}
          <Field label="Kategori Pengeluaran" error={errors.categoryCode?.message}>
            <Select
              value={categoryCode}
              onChange={(e) => handleCategoryChange(e.target.value as ExpenseCategoryCode)}
            >
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat.code} value={cat.code}>
                  {cat.label}
                </option>
              ))}
            </Select>
          </Field>

          {/* Dynamic Employee Selector for Kasbon, Advance, and Salary */}
          {(isLoanOrAdvance || isSalary) && (
            <Field
              label={isSalary ? "Karyawan Penerima Gaji *" : "Nama Karyawan *"}
              error={errors.employeeId?.message}
            >
              <Select
                value={employeeId || ""}
                onChange={(e) => handleEmployeeChange(e.target.value)}
              >
                <option value="">— Pilih Karyawan —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.position} - {emp.department})
                  </option>
                ))}
              </Select>
              {employees.length === 0 && (
                <span className="mt-1 block text-xs text-amber-700">
                  Belum ada master data karyawan. Tambahkan di menu SDM → Data Karyawan.
                </span>
              )}
            </Field>
          )}

          {/* Dynamic Field for Salary: Periode Gaji & Kebijakan Akuntansi */}
          {isSalary && (
            <Field label="Periode Gaji *" error={errors.salaryPeriod?.message}>
              <Input
                type="month"
                placeholder="YYYY-MM"
                {...register("salaryPeriod")}
              />
              <span className="mt-1 block text-xs text-slate-500">Pilih bulan dan tahun penggajian (format: YYYY-MM).</span>
            </Field>
          )}

          {isSalary && (
            <div className="md:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-emerald-950 mb-2">
                Kebijakan Akuntansi Pembayaran Gaji *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    salaryPaymentType === "EXPENSE"
                      ? "bg-white border-emerald-600 shadow-xs ring-1 ring-emerald-600"
                      : "bg-white/70 border-slate-200 hover:bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="salaryPaymentTypeRadio"
                    value="EXPENSE"
                    checked={salaryPaymentType === "EXPENSE"}
                    onChange={() => {
                      setValue("salaryPaymentType", "EXPENSE", { shouldDirty: true });
                      setValue("coaId", "6-1002", { shouldDirty: true });
                      setValue("coaNameSnapshot", "6-1002 Beban Gaji Karyawan", { shouldDirty: true });
                    }}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="block text-xs font-bold text-slate-900">Beban Gaji Langsung (Akun 6-1002)</span>
                    <span className="block text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                      Pengeluaran langsung membebani laba rugi operasional periode berjalan (Debet: 6-1002 Beban Gaji Karyawan).
                    </span>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    salaryPaymentType === "PAYABLE"
                      ? "bg-white border-emerald-600 shadow-xs ring-1 ring-emerald-600"
                      : "bg-white/70 border-slate-200 hover:bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="salaryPaymentTypeRadio"
                    value="PAYABLE"
                    checked={salaryPaymentType === "PAYABLE"}
                    onChange={() => {
                      setValue("salaryPaymentType", "PAYABLE", { shouldDirty: true });
                      setValue("coaId", "2-1002", { shouldDirty: true });
                      setValue("coaNameSnapshot", "2-1002 Utang Gaji", { shouldDirty: true });
                    }}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="block text-xs font-bold text-slate-900">Pelunasan Utang Gaji (Akun 2-1002)</span>
                    <span className="block text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                      Melunasi kewajiban utang gaji yang telah diakrualkan sebelumnya oleh payroll (Debet: 2-1002 Utang Gaji).
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Dynamic Field for Kasbon / Advance: Jatuh Tempo */}
          {isLoanOrAdvance && (
            <Field
              label={categoryCode === "employee_loan" ? "Estimasi Jatuh Tempo Pelunasan" : "Tenggat Pertanggungjawaban"}
              error={errors.dueDate?.message}
            >
              <Input type="date" {...register("dueDate")} />
            </Field>
          )}

          {/* Dynamic Field for Kasbon / Advance: Keperluan / Tujuan */}
          {isLoanOrAdvance && (
            <div className="md:col-span-2">
              <Field
                label={categoryCode === "employee_loan" ? "Keperluan Kasbon *" : "Tujuan Uang Muka Operasional *"}
                error={errors.purpose?.message}
              >
                <Input
                  placeholder={
                    categoryCode === "employee_loan"
                      ? "Contoh: Keperluan keluarga mendesak / renovasi rumah"
                      : "Contoh: Perjalanan dinas proyek luar kota / pembelian perlengkapan lapangan"
                  }
                  {...register("purpose")}
                />
              </Field>
            </div>
          )}

          <Field label="Nama vendor / penerima" error={errors.vendorName?.message}>
            <Input {...register("vendorName")} placeholder="Nama toko, vendor, atau karyawan" />
          </Field>

          <Field
            label={isSalary ? "Jumlah dibayarkan (Net Transfer) *" : "Jumlah *"}
            error={errors.amount?.message}
          >
            <MoneyInput
              value={amount}
              min={1}
              onValueChange={(value) => setValue("amount", value, { shouldDirty: true, shouldValidate: true })}
            />
            {isSalary && (
              <span className="mt-1 block text-xs text-slate-500">
                Nominal bersih (take-home) yang dibayarkan ke karyawan.
              </span>
            )}
          </Field>

          <Field label="Metode pembayaran" error={errors.paymentMethod?.message}>
            <Select {...register("paymentMethod")}>
              <option value="">Pilih metode</option>
              <option>Transfer</option>
              <option>Tunai</option>
              <option>QRIS</option>
              <option>Kartu</option>
            </Select>
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

          <div className="md:col-span-2">
            <Field label="Deskripsi" error={errors.description?.message}>
              <Textarea rows={3} {...register("description")} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Catatan">
              <Textarea rows={2} placeholder="Opsional" {...register("notes")} />
            </Field>
          </div>
        </div>
      </section>

      {/* Live Accounting Double-Entry Journal Preview */}
      <ExpenseJournalPreview
        categoryCode={categoryCode}
        amount={amount}
        rekeningName={rekeningNameSnapshot}
        employeeName={selectedEmployee?.name}
        vendorName={vendorName}
        salaryPeriod={salaryPeriod}
        salaryPaymentType={salaryPaymentType}
        purpose={purpose}
        coaId={coaId}
        coaNameSnapshot={coaNameSnapshot}
      />

      <div className="sticky bottom-3 z-20 rounded-md border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur md:static md:flex md:justify-end md:border-0 md:bg-transparent md:p-0 md:shadow-none">
        <Button type="submit" className="w-full md:w-auto" disabled={isSubmitting}>
          {isSubmitting ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Simpan Pengeluaran"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      <span className="mb-1 block">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs font-normal text-red-600">{error}</span>}
    </label>
  );
}
