import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Input } from "@/components/ui/Input";
import { ResponsiveFilterPanel } from "@/components/ui/ResponsiveFilterPanel";
import { Select } from "@/components/ui/Select";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import {
  listDeliveryOfficers,
  listDeliveryOrdersPage,
  type ListDeliveryOrdersFilter
} from "@/lib/deliveryOrders/store";
import { DeliveryOrderQueueTable } from "@/components/deliveryOrders/DeliveryOrderQueueTable";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const PAGE_SIZE = 10;

function valueOf(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(params: SearchParams, page: number): string {
  const next = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && key !== "page") next.set(key, value);
  }
  next.set("page", String(page));
  return `/delivery-orders?${next.toString()}`;
}

function filtersFromParams(
  params: SearchParams,
  userRole?: string,
  userId?: string
): ListDeliveryOrdersFilter {
  const isAllExplicit = valueOf(params, "view") === "all";
  const hasExplicitOfficerParam = "officerId" in params;
  let officerId = valueOf(params, "officerId") || undefined;

  if (userRole === "DELIVERY_DRIVER" && !hasExplicitOfficerParam && !isAllExplicit) {
    officerId = userId;
  }

  const rawStatus = valueOf(params, "status") || undefined;
  // Non-Super Admin (bukan OWNER) tidak diizinkan memfilter DO selesai
  const status = userRole !== "OWNER" && rawStatus === "selesai" ? undefined : rawStatus;

  return {
    search: valueOf(params, "search") || undefined,
    status,
    packingStatus: valueOf(params, "packingStatus") || undefined,
    shippingStatus: valueOf(params, "shippingStatus") || undefined,
    assignedUserId: officerId
  };
}

function officerFilterLabel(
  officers: Array<{ id: string; name: string }>,
  value?: string,
  currentUserId?: string
): string | undefined {
  if (!value) return undefined;
  if (value === "unassigned") return "Belum Ditugaskan";
  if (currentUserId && value === currentUserId) return "Tugas Saya";
  const officer = officers.find((o) => o.id === value);
  return officer ? officer.name : value;
}

function statusLabel(status?: string): string | undefined {
  if (status === "belum_selesai") return "Belum Selesai";
  if (status === "selesai_sebagian") return "Selesai Sebagian";
  if (status === "selesai") return "Selesai";
  return status;
}

function packingStatusLabel(status?: string): string | undefined {
  if (status === "belum") return "Belum Packing";
  if (status === "sudah") return "Sudah Packing";
  return status;
}

function shippingStatusLabel(status?: string): string | undefined {
  if (status === "belum") return "Belum Kirim";
  if (status === "sudah") return "Sudah Kirim";
  return status;
}

function activeFilterLabels(
  params: SearchParams,
  officers: Array<{ id: string; name: string }>,
  effectiveOfficerId?: string,
  currentUserId?: string
): string[] {
  return [
    valueOf(params, "search") ? `Cari: ${valueOf(params, "search")}` : null,
    valueOf(params, "status") ? `Status: ${statusLabel(valueOf(params, "status"))}` : null,
    valueOf(params, "packingStatus")
      ? `Packing: ${packingStatusLabel(valueOf(params, "packingStatus"))}`
      : null,
    valueOf(params, "shippingStatus")
      ? `Pengiriman: ${shippingStatusLabel(valueOf(params, "shippingStatus"))}`
      : null,
    effectiveOfficerId
      ? `Petugas: ${officerFilterLabel(officers, effectiveOfficerId, currentUserId)}`
      : null
  ].filter(Boolean) as string[];
}

export default async function DeliveryOrdersPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!can(user.role, "do.view")) {
    redirect("/");
  }

  const params = (await searchParams) || {};
  const page = Math.max(1, Number(valueOf(params, "page") || "1"));

  const isAllExplicit = valueOf(params, "view") === "all";
  const hasExplicitOfficerParam = "officerId" in params;
  const isDriver = user.role === "DELIVERY_DRIVER";
  const defaultToMyTasks = isDriver && !hasExplicitOfficerParam && !isAllExplicit;
  const effectiveOfficerId = defaultToMyTasks ? user.id : (valueOf(params, "officerId") || undefined);

  const filters = filtersFromParams(params, user.role, user.id);

  const [{ data: paged, meta }, officers] = await Promise.all([
    listDeliveryOrdersPage(
      { page, pageSize: PAGE_SIZE, filters },
      user
    ),
    listDeliveryOfficers()
  ]);

  const canAssign = can(user.role, "do.assign");
  const canProcess = can(user.role, "do.process");
  const totalPages = meta.totalPages;
  const activeFilters = activeFilterLabels(params, officers, effectiveOfficerId, user.id);

  const currentStatus = valueOf(params, "status");
  const isMyTasks = effectiveOfficerId === user.id && !isAllExplicit;
  const isAll = isAllExplicit || (!currentStatus && !effectiveOfficerId && !valueOf(params, "search") && !valueOf(params, "packingStatus") && !valueOf(params, "shippingStatus"));
  const isBelumSelesai = currentStatus === "belum_selesai";

  return (
    <AppShell>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">
            Logistik &amp; Pengiriman
          </p>
          <h2 className="aj-page-title text-3xl font-bold">Delivery Order (DO)</h2>
          <p className="mt-2 text-sm text-slate-600">
            Antrean pengiriman pesanan, penugasan petugas DO, dan pemenuhan packing/kirim barang.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
            <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8h4.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a2 2 0 104 0m-10 0a2 2 0 104 0" />
            </svg>
            <span>Mode Pengiriman</span>
          </span>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500">Shortcut:</span>
        {user.id && (
          <Link
            href={isDriver ? "/delivery-orders" : `/delivery-orders?officerId=${user.id}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              isMyTasks
                ? "bg-blue-700 text-white"
                : "bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100"
            }`}
          >
            Tugas Saya {isDriver && "(Default)"}
          </Link>
        )}
        <Link
          href="/delivery-orders?view=all"
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            isAll && !isMyTasks
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          Semua Antrean
        </Link>
        <Link
          href={isMyTasks ? `/delivery-orders?status=belum_selesai&officerId=${user.id}` : "/delivery-orders?status=belum_selesai&view=all"}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            isBelumSelesai
              ? "bg-emerald-700 text-white"
              : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
          }`}
        >
          Belum Selesai
        </Link>
      </div>

      <ResponsiveFilterPanel
        title="Filter Delivery Order"
        resetHref={isDriver ? "/delivery-orders" : "/delivery-orders?view=all"}
        activeFilters={activeFilters}
        emptyText="Filter aktif: semua antrean."
        className="mb-5"
        formClassName="grid gap-3 md:grid-cols-2 xl:grid-cols-5"
        actionsClassName="md:col-span-2 xl:col-span-5"
      >
        <label className="text-sm font-medium text-slate-700">
          Pencarian
          <Input
            name="search"
            defaultValue={valueOf(params, "search") || ""}
            placeholder="No DO / Inv / Customer / Lokasi"
            className="mt-1"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Status DO
          <Select
            name="status"
            defaultValue={valueOf(params, "status") || ""}
            className="mt-1"
          >
            <option value="">Semua</option>
            <option value="belum_selesai">Belum Selesai</option>
            <option value="selesai_sebagian">Selesai Sebagian</option>
            {user.role === "OWNER" && <option value="selesai">Selesai</option>}
          </Select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Status Packing
          <Select
            name="packingStatus"
            defaultValue={valueOf(params, "packingStatus") || ""}
            className="mt-1"
          >
            <option value="">Semua</option>
            <option value="belum">Belum Packing</option>
            <option value="sudah">Sudah Packing</option>
          </Select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Status Kirim
          <Select
            name="shippingStatus"
            defaultValue={valueOf(params, "shippingStatus") || ""}
            className="mt-1"
          >
            <option value="">Semua</option>
            <option value="belum">Belum Kirim</option>
            <option value="sudah">Sudah Kirim</option>
          </Select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Petugas DO
          <Select
            name="officerId"
            defaultValue={effectiveOfficerId || ""}
            className="mt-1"
          >
            <option value="">Semua</option>
            <option value="unassigned">Belum Ditugaskan</option>
            {officers.map((officer) => (
              <option key={officer.id} value={officer.id}>
                {officer.name}
              </option>
            ))}
          </Select>
        </label>
      </ResponsiveFilterPanel>

      <section className="aj-surface">
        <div className="border-b border-slate-200 px-5 py-4 text-sm text-slate-600">
          Menampilkan {paged.length} dari {meta.total} delivery order.
        </div>

        <DeliveryOrderQueueTable
          initialQueue={paged}
          officers={officers}
          canAssign={canAssign}
          canProcess={canProcess}
          currentUserId={user.id}
          currentUserRole={user.role}
          currentUserName={user.name || user.id}
        />

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm">
          <span className="text-slate-500">
            Halaman {page} dari {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                className="rounded-sm border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
                href={pageHref(params, page - 1)}
              >
                Sebelumnya
              </Link>
            )}
            {page < totalPages && (
              <Link
                className="rounded-sm border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
                href={pageHref(params, page + 1)}
              >
                Berikutnya
              </Link>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
