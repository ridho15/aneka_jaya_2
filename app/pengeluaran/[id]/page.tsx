import Link from "next/link";
import { redirect } from "next/navigation";
import { AttachmentPreview } from "@/components/attachments/AttachmentPreview";
import { AppShell } from "@/components/layout/AppShell";
import { TransactionCancelButton } from "@/components/transactions/TransactionCancelButton";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { getExpenseRecord } from "@/lib/expenses/store";

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function Badge({ value, tone = "slate" }: { value: string; tone?: "slate" | "green" | "amber" | "red" }) {
  const colors = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700"
  }[tone];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${colors}`}>{value}</span>;
}

function statusTone(value?: string) {
  if (value === "approved" || value === "synced") return "green";
  if (value === "pending_approval" || value === "pending") return "amber";
  if (value === "rejected" || value === "failed" || value === "cancelled") return "red";
  return "slate";
}

export default async function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const role = await getCurrentRole();
  if (!can(role, "pengeluaran.view")) redirect("/");
  const { id } = await params;
  const expense = await getExpenseRecord(id);
  if (!expense) redirect("/pengeluaran");
  const canManage = can(role, "pengeluaran.manage");

  return (
    <AppShell>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Detail Pengeluaran</p>
          <h2 className="aj-page-title text-3xl font-bold">{expense.vendorName}</h2>
          <p className="mt-2 font-mono text-sm text-slate-500">{expense.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/pengeluaran" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Riwayat</Link>
          <Link href={`/print/expenses/${expense.id}`} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">Cetak</Link>
          {canManage && expense.approvalStatus !== "cancelled" && !(expense.erpSyncTarget === "erp" && expense.erpSyncStatus === "synced") && <Link href={`/pengeluaran/${expense.id}/edit`} className="rounded-xl border border-blue-300 px-4 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50">Edit</Link>}
        </div>
      </div>

      <section className="aj-surface mb-5 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <Info label="Tanggal" value={expense.expenseDate} />
          <Info label="Tipe" value={expense.tipeCodeSnapshot || expense.tipeId || "—"} />
          <Info label="Rekening" value={expense.rekeningNameSnapshot || "—"} />
          <Info label="COA" value={expense.coaNameSnapshot || "—"} />
          <Info label="Kategori" value={expense.category} />
          <Info label="Metode" value={expense.paymentMethod} />
          <Info label="Vendor/Penerima" value={expense.vendorName} />
          <Info label="Pembuat" value={expense.createdByNameSnapshot || "—"} />
          <Info label="Nominal" value={rupiah(expense.amount)} strong />
          <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Approval</p><div className="mt-1"><Badge value={expense.approvalStatus || "approved"} tone={statusTone(expense.approvalStatus || "approved")} /></div></div>
          <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">ERP Sync</p><div className="mt-1"><Badge value={expense.erpSyncStatus || "not_required"} tone={statusTone(expense.erpSyncStatus || "not_required")} /></div></div>
          <Info label="ERP Reference" value={expense.erpReference || "—"} />
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Info label="Deskripsi" value={expense.description} />
          <Info label="Catatan" value={expense.notes || "—"} />
        </div>
        {expense.erpSyncError && <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{expense.erpSyncError}</p>}
        {canManage && (
          <div className="mt-5">
            <TransactionCancelButton
              id={expense.id}
              kind="expenses"
              disabled={expense.approvalStatus === "cancelled" || (expense.erpSyncTarget === "erp" && expense.erpSyncStatus === "synced")}
              disabledReason={expense.erpSyncTarget === "erp" && expense.erpSyncStatus === "synced" ? "Pengeluaran AJ sudah synced ke ERP dan perlu mekanisme koreksi resmi." : "Pengeluaran sudah dibatalkan."}
            />
          </div>
        )}
      </section>

      <section className="aj-surface p-5">
        <h3 className="mb-3 font-bold text-slate-900">Lampiran</h3>
        {expense.attachmentUrl ? <AttachmentPreview url={expense.attachmentUrl} label="Bukti pengeluaran" /> : <p className="text-sm text-slate-500">Tidak ada lampiran.</p>}
      </section>
    </AppShell>
  );
}

function Info({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 ${strong ? "text-lg font-bold text-slate-900" : "text-sm text-slate-700"}`}>{value}</p></div>;
}
