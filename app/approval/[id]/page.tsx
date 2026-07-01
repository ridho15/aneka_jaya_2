import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { getApprovalRequest } from "@/lib/approval/store";
import { ApprovalActionForm } from "@/components/approval/ApprovalActionForm";

export const dynamic = "force-dynamic";

export default async function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await getCurrentRole();
  if (!can(role, "approval.view")) redirect("/");
  const item = await getApprovalRequest(id);
  if (!item) redirect("/approval");
  const canPrintSale = item.module === "penjualan" && item.status === "approved" && item.entityId;

  return (
    <AppShell>
      <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="aj-page-title text-3xl font-bold">Detail Approval</h2>
          <p className="mt-2 text-sm text-slate-600">{item.module} • {item.status}</p>
        </div>
        {canPrintSale && (
          <Link
            href={`/print/sales/${item.entityId}`}
            className="inline-flex items-center justify-center border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
          >
            Cetak Penjualan
          </Link>
        )}
      </div>
      <section className="aj-surface max-w-3xl p-6">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Info label="Module" value={item.module} />
          <Info label="Tipe" value={item.tipeCodeSnapshot || "-"} />
          <Info label="Created by" value={`${item.createdByNameSnapshot} (${item.createdByRoleSnapshot})`} />
          <Info label="Nominal" value={new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(item.amount || 0)} />
          <Info label="Status" value={item.status} />
          <Info label="Referensi" value={item.entityId} />
        </dl>
        {item.module === "penjualan" && item.status === "pending_approval" && (
          <p className="mt-5 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Cetak final tersedia setelah approval.</p>
        )}
        {item.status === "pending_approval" && can(role, "approval.approve") && <ApprovalActionForm id={item.id} />}
      </section>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-900">{value}</dd></div>;
}
