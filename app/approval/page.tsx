import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listApprovalRequests, type ApprovalRequest } from "@/lib/approval/store";

export const dynamic = "force-dynamic";

export default async function ApprovalPage() {
  const role = await getCurrentRole();
  if (!can(role, "approval.view")) redirect("/");
  const rows: ApprovalRequest[] = await listApprovalRequests();
  const pending = rows.filter((row: ApprovalRequest) => row.status === "pending_approval");
  const history = rows.filter((row: ApprovalRequest) => row.status !== "pending_approval");
  const rupiah = (value = 0) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
  const statusBadge = (status: string) => {
    if (status === "approved") return "bg-emerald-50 text-emerald-700";
    if (status === "rejected") return "bg-red-50 text-red-700";
    return "bg-amber-50 text-amber-700";
  };

  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-blue-600">Manager / Super Admin</p>
        <h2 className="aj-page-title text-3xl font-bold">Approval</h2>
        <p className="mt-2 text-sm text-slate-600">Approve atau reject transaksi yang menunggu pemeriksaan.</p>
      </div>

      <section className="mb-8">
        <div className="mb-3 flex items-center gap-3">
          <h3 className="text-lg font-bold">Menunggu Approval</h3>
          {pending.length > 0 && <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold text-white">{pending.length}</span>}
        </div>
        <div className="aj-surface overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-amber-50 text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="px-5 py-3">Tanggal</th><th className="px-5 py-3">Module</th><th className="px-5 py-3">Tipe</th><th className="px-5 py-3">Created by</th><th className="px-5 py-3">Nominal</th><th className="px-5 py-3">Aksi</th></tr>
            </thead>
            <tbody>
              {pending.map((row) => (
                <tr key={row.id} className="border-b border-amber-50 bg-amber-50/40">
                  <td className="px-5 py-4">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt))}</td>
                  <td className="px-5 py-4 capitalize">{row.module}</td>
                  <td className="px-5 py-4">{row.tipeCodeSnapshot || "-"}</td>
                  <td className="px-5 py-4">{row.createdByNameSnapshot}<span className="ml-2 text-xs text-slate-500">{row.createdByRoleSnapshot}</span></td>
                  <td className="px-5 py-4 font-semibold">{rupiah(row.amount)}</td>
                  <td className="px-5 py-4"><a className="text-sm font-semibold text-blue-600 hover:text-blue-800" href={`/approval/${row.id}`}>Approve / Reject →</a></td>
                </tr>
              ))}
              {pending.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500">Tidak ada transaksi yang menunggu approval.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-bold">Riwayat Approval</h3>
        <div className="aj-surface overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="px-5 py-3">Tanggal</th><th className="px-5 py-3">Module</th><th className="px-5 py-3">Tipe</th><th className="px-5 py-3">Created by</th><th className="px-5 py-3">Nominal</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Detail</th></tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-5 py-4">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt))}</td>
                  <td className="px-5 py-4 capitalize">{row.module}</td>
                  <td className="px-5 py-4">{row.tipeCodeSnapshot || "-"}</td>
                  <td className="px-5 py-4">{row.createdByNameSnapshot}<span className="ml-2 text-xs text-slate-500">{row.createdByRoleSnapshot}</span></td>
                  <td className="px-5 py-4">{rupiah(row.amount)}</td>
                  <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(row.status)}`}>{row.status}</span></td>
                  <td className="px-5 py-4"><a className="text-sm font-semibold text-blue-600" href={`/approval/${row.id}`}>Lihat →</a></td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-500">Belum ada riwayat approval.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
