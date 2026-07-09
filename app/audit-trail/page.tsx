import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Input } from "@/components/ui/Input";
import { ResponsiveFilterPanel } from "@/components/ui/ResponsiveFilterPanel";
import { Select } from "@/components/ui/Select";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listAuditPaginated, type AuditAction, type AuditEntityType } from "@/lib/audit/store";

export const dynamic = "force-dynamic";

const ENTITY_TYPES: AuditEntityType[] = ["sales", "expense", "purchase", "product", "stock", "rekening", "tipe", "coa", "user", "tempo", "approval", "erp_sync", "whatsapp_report", "stock_alert", "rekening_reset"];
const ACTIONS: AuditAction[] = ["create", "update", "approve", "reject", "archive", "disable", "enable", "mark_paid", "partial_paid", "cancel", "write_off", "reset", "send_whatsapp", "retry_sync", "login", "logout"];

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function valueOf(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(params: Record<string, string | string[] | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && key !== "page") next.set(key, value);
  }
  next.set("page", String(page));
  return `/audit-trail?${next.toString()}`;
}

function activeFilterLabels(params: Record<string, string | string[] | undefined>) {
  return [
    valueOf(params, "from") ? `Dari ${valueOf(params, "from")}` : null,
    valueOf(params, "to") ? `Sampai ${valueOf(params, "to")}` : null,
    valueOf(params, "entityType") ? `Entity: ${valueOf(params, "entityType")}` : null,
    valueOf(params, "action") ? `Aksi: ${valueOf(params, "action")}` : null,
    valueOf(params, "keyword") ? `Keyword: ${valueOf(params, "keyword")}` : null
  ].filter(Boolean) as string[];
}

export default async function AuditTrailPage({ searchParams }: Props) {
  const role = await getCurrentRole();
  if (!can(role, "audit.view")) redirect("/no-access");
  const params = await searchParams || {};
  const result = await listAuditPaginated({
    role,
    from: valueOf(params, "from"),
    to: valueOf(params, "to"),
    entityType: valueOf(params, "entityType"),
    action: valueOf(params, "action"),
    keyword: valueOf(params, "keyword"),
    page: Number(valueOf(params, "page") || "1"),
    pageSize: 50
  });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const activeFilters = activeFilterLabels(params);

  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Append-only</p>
        <h2 className="aj-page-title text-3xl font-bold">Audit Trail</h2>
        <p className="mt-2 text-sm text-slate-600">Riwayat siapa yang membuat, mengubah, approve/reject, membayar tempo, mengirim WhatsApp, dan sinkron ERP.</p>
      </div>

      <ResponsiveFilterPanel
        title="Filter audit trail"
        resetHref="/audit-trail"
        activeFilters={activeFilters}
        emptyText="Filter aktif: semua aktivitas."
        className="mb-5"
        formClassName="grid gap-3 md:grid-cols-5"
        actionsClassName="md:col-span-5"
      >
        <label className="text-sm font-medium text-slate-700">
          Dari tanggal
          <Input type="date" name="from" defaultValue={valueOf(params, "from") || ""} className="mt-1" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Sampai tanggal
          <Input type="date" name="to" defaultValue={valueOf(params, "to") || ""} className="mt-1" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Entity
          <Select name="entityType" defaultValue={valueOf(params, "entityType") || ""} className="mt-1">
            <option value="">Semua entity</option>
            {ENTITY_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Aksi
          <Select name="action" defaultValue={valueOf(params, "action") || ""} className="mt-1">
            <option value="">Semua aksi</option>
            {ACTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Keyword
          <Input name="keyword" defaultValue={valueOf(params, "keyword") || ""} placeholder="User, alasan, referensi" className="mt-1" />
        </label>
      </ResponsiveFilterPanel>

      <section className="aj-surface">
        <div className="border-b border-slate-200 px-5 py-4 text-sm text-slate-600">Menampilkan {result.entries.length} dari {result.total} aktivitas.</div>
        <div data-testid="audit-mobile-cards" className="space-y-3 p-4 md:hidden">
          {result.entries.map((entry) => (
            <article key={entry.id} className="relative rounded-md border border-slate-200 bg-white p-4 pl-5 shadow-sm">
              <span className="absolute left-0 top-4 h-10 w-1 rounded-r-full bg-emerald-500" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{entry.action}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(entry.createdAt))}</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{entry.userRoleSnapshot}</span>
              </div>
              <dl className="mt-3 grid gap-2 text-sm text-slate-600">
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">User</dt><dd className="mt-0.5 font-semibold text-slate-900">{entry.userNameSnapshot}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Entity</dt><dd className="mt-0.5">{entry.entityType} • {entry.entityId}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Alasan / Tujuan</dt><dd className="mt-0.5">{entry.reason || "-"}</dd></div>
              </dl>
            </article>
          ))}
          {result.entries.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Belum ada aktivitas sesuai filter.</p>}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="px-5 py-3">Waktu</th><th className="px-5 py-3">User</th><th className="px-5 py-3">Entity</th><th className="px-5 py-3">Aksi</th><th className="px-5 py-3">Referensi</th><th className="px-5 py-3">Alasan / Tujuan</th><th className="px-5 py-3">Role</th></tr>
            </thead>
            <tbody>
              {result.entries.map((entry) => <tr key={entry.id} className="border-b border-slate-100"><td className="px-5 py-4 text-slate-600">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(entry.createdAt))}</td><td className="px-5 py-4"><b>{entry.userNameSnapshot}</b></td><td className="px-5 py-4">{entry.entityType}</td><td className="px-5 py-4">{entry.action}</td><td className="px-5 py-4">{entry.entityId}</td><td className="px-5 py-4">{entry.reason || "-"}</td><td className="px-5 py-4"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{entry.userRoleSnapshot}</span></td></tr>)}
              {result.entries.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-500">Belum ada aktivitas sesuai filter.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm">
          <span className="text-slate-500">Halaman {result.page} dari {totalPages}</span>
          <div className="flex gap-2">
            {result.page > 1 && <Link className="rounded-sm border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50" href={pageHref(params, result.page - 1)}>Sebelumnya</Link>}
            {result.page < totalPages && <Link className="rounded-sm border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50" href={pageHref(params, result.page + 1)}>Berikutnya</Link>}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
