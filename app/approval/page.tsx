import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listApprovalRequestsPage } from "@/lib/approval/store";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 10;

type SearchParams = Record<string, string | string[] | undefined>;

function valueOf(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function toPage(value?: string) {
  const page = Number(value || "1");
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function pageHref(params: SearchParams, key: "pendingPage" | "historyPage", page: number) {
  const next = new URLSearchParams();
  for (const [paramKey, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && paramKey !== key) next.set(paramKey, value);
  }
  next.set(key, String(page));
  return `/approval?${next.toString()}`;
}

export default async function ApprovalPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const role = await getCurrentRole();
  if (!can(role, "approval.view")) redirect("/");
  const params = await searchParams || {};
  const pendingPage = toPage(valueOf(params, "pendingPage"));
  const historyPage = toPage(valueOf(params, "historyPage"));
  const [{ data: pending, meta: pendingMeta }, { data: history, meta: historyMeta }] = await Promise.all([
    listApprovalRequestsPage({ page: pendingPage, pageSize: PAGE_SIZE, filter: { status: "active" } }),
    listApprovalRequestsPage({ page: historyPage, pageSize: PAGE_SIZE, filter: { status: "history" } })
  ]);
  const rupiah = (value = 0) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
  const statusBadge = (status: string) => {
    if (status === "approved") return "bg-emerald-50 text-emerald-700";
    if (status === "rejected") return "bg-red-50 text-red-700";
    return "bg-amber-50 text-amber-700";
  };

  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Manager / Super Admin</p>
        <h2 className="aj-page-title text-3xl font-bold">Approval</h2>
        <p className="mt-2 text-sm text-slate-600">Approve atau reject transaksi yang menunggu pemeriksaan.</p>
      </div>

      <section className="mb-8">
        <div className="mb-3 flex items-center gap-3">
          <h3 className="text-lg font-bold">Menunggu Approval</h3>
          {pendingMeta.total > 0 && <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold text-white">{pendingMeta.total}</span>}
        </div>
        <div className="aj-surface">
          <div className="space-y-3 p-4 md:hidden">
            {pending.map((row) => (
              <article key={row.id} className="rounded-md border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold capitalize text-slate-900">{row.module}</p>
                    <p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(row.createdAt))}</p>
                  </div>
                  <p className="shrink-0 font-bold text-slate-900">{rupiah(row.amount)}</p>
                </div>
                <dl className="mt-3 grid gap-2 text-sm text-slate-600">
                  <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tipe</dt><dd className="mt-0.5">{row.tipeCodeSnapshot || "-"}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Dibuat oleh</dt><dd className="mt-0.5">{row.createdByNameSnapshot} <span className="text-xs text-slate-500">{row.createdByRoleSnapshot}</span></dd></div>
                </dl>
                <Link className="mt-4 block rounded-sm bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-700" href={`/approval/${row.id}`}>Approve / Reject</Link>
              </article>
            ))}
            {pending.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Tidak ada transaksi yang menunggu approval.</p>}
          </div>
          <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-amber-50 text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="px-5 py-3">Tanggal</th><th className="px-5 py-3">Module</th><th className="px-5 py-3">Tipe</th><th className="px-5 py-3">Created by</th><th className="px-5 py-3">Nominal</th><th className="px-5 py-3">Aksi</th></tr>
            </thead>
            <tbody>
              {pending.map((row) => (
                <tr key={row.id} className="border-b border-amber-50 bg-amber-50/40">
                  <td className="px-5 py-4">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(row.createdAt))}</td>
                  <td className="px-5 py-4 capitalize">{row.module}</td>
                  <td className="px-5 py-4">{row.tipeCodeSnapshot || "-"}</td>
                  <td className="px-5 py-4">{row.createdByNameSnapshot}<span className="ml-2 text-xs text-slate-500">{row.createdByRoleSnapshot}</span></td>
                  <td className="px-5 py-4 font-semibold">{rupiah(row.amount)}</td>
                  <td className="px-5 py-4"><Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-800" href={`/approval/${row.id}`}>Approve / Reject →</Link></td>
                </tr>
              ))}
              {pending.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500">Tidak ada transaksi yang menunggu approval.</td></tr>}
            </tbody>
          </table>
          </div>
          <Pagination current={pendingMeta.page} totalPages={pendingMeta.totalPages} hrefFor={(page) => pageHref(params, "pendingPage", page)} />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-bold">Riwayat Approval</h3>
        <div className="aj-surface">
          <div className="space-y-3 p-4 md:hidden">
            {history.map((row) => (
              <article key={row.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold capitalize text-slate-900">{row.module}</p>
                    <p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(row.createdAt))}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(row.status)}`}>{row.status}</span>
                </div>
                <dl className="mt-3 grid gap-2 text-sm text-slate-600">
                  <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Nominal</dt><dd className="mt-0.5 font-semibold text-slate-900">{rupiah(row.amount)}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Dibuat oleh</dt><dd className="mt-0.5">{row.createdByNameSnapshot} <span className="text-xs text-slate-500">{row.createdByRoleSnapshot}</span></dd></div>
                </dl>
                <Link className="mt-4 block rounded-sm border border-slate-300 px-3 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50" href={`/approval/${row.id}`}>Lihat Detail</Link>
              </article>
            ))}
            {history.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Belum ada riwayat approval.</p>}
          </div>
          <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="px-5 py-3">Tanggal</th><th className="px-5 py-3">Module</th><th className="px-5 py-3">Tipe</th><th className="px-5 py-3">Created by</th><th className="px-5 py-3">Nominal</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Detail</th></tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-5 py-4">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(row.createdAt))}</td>
                  <td className="px-5 py-4 capitalize">{row.module}</td>
                  <td className="px-5 py-4">{row.tipeCodeSnapshot || "-"}</td>
                  <td className="px-5 py-4">{row.createdByNameSnapshot}<span className="ml-2 text-xs text-slate-500">{row.createdByRoleSnapshot}</span></td>
                  <td className="px-5 py-4">{rupiah(row.amount)}</td>
                  <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(row.status)}`}>{row.status}</span></td>
                  <td className="px-5 py-4"><Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-800" href={`/approval/${row.id}`}>Lihat →</Link></td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-500">Belum ada riwayat approval.</td></tr>}
            </tbody>
          </table>
          </div>
          <Pagination current={historyMeta.page} totalPages={historyMeta.totalPages} hrefFor={(page) => pageHref(params, "historyPage", page)} />
        </div>
      </section>
    </AppShell>
  );
}

function Pagination({ current, totalPages, hrefFor }: { current: number; totalPages: number; hrefFor: (page: number) => string }) {
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm">
      <span className="text-slate-500">Halaman {current} dari {totalPages}</span>
      <div className="flex gap-2">
        {current > 1 && <Link className="rounded-sm border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50" href={hrefFor(current - 1)}>Sebelumnya</Link>}
        {current < totalPages && <Link className="rounded-sm border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50" href={hrefFor(current + 1)}>Berikutnya</Link>}
      </div>
    </div>
  );
}
