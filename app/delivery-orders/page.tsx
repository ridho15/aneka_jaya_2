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

function filtersFromParams(params: SearchParams): ListDeliveryOrdersFilter {
  return {
    search: valueOf(params, "search") || undefined,
    status: valueOf(params, "status") || undefined,
    packingStatus: valueOf(params, "packingStatus") || undefined,
    shippingStatus: valueOf(params, "shippingStatus") || undefined,
    assignedUserId: valueOf(params, "officerId") || undefined
  };
}

function officerFilterLabel(
  officers: Array<{ id: string; name: string }>,
  value?: string
): string | undefined {
  if (!value) return undefined;
  if (value === "unassigned") return "Belum Ditugaskan";
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
  officers: Array<{ id: string; name: string }>
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
    valueOf(params, "officerId")
      ? `Petugas: ${officerFilterLabel(officers, valueOf(params, "officerId"))}`
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

  const [{ data: paged, meta }, officers] = await Promise.all([
    listDeliveryOrdersPage(
      { page, pageSize: PAGE_SIZE, filters: filtersFromParams(params) },
      user
    ),
    listDeliveryOfficers()
  ]);

  const canAssign = can(user.role, "do.assign");
  const canProcess = can(user.role, "do.process");
  const totalPages = meta.totalPages;
  const activeFilters = activeFilterLabels(params, officers);

  const currentStatus = valueOf(params, "status");
  const currentOfficerId = valueOf(params, "officerId");
  const isAll =
    !currentStatus &&
    !currentOfficerId &&
    !valueOf(params, "search") &&
    !valueOf(params, "packingStatus") &&
    !valueOf(params, "shippingStatus");
  const isBelumSelesai = currentStatus === "belum_selesai";
  const isMyTasks = currentOfficerId === user.id;

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
          <span className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
            ⛟ Mode Pengiriman
          </span>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500">Shortcut:</span>
        <Link
          href="/delivery-orders"
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            isAll
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          Semua Antrean
        </Link>
        <Link
          href="/delivery-orders?status=belum_selesai"
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            isBelumSelesai
              ? "bg-emerald-700 text-white"
              : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
          }`}
        >
          Belum Selesai
        </Link>
        {user.id && (
          <Link
            href={`/delivery-orders?officerId=${user.id}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              isMyTasks
                ? "bg-blue-700 text-white"
                : "bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100"
            }`}
          >
            Tugas Saya
          </Link>
        )}
      </div>

      <ResponsiveFilterPanel
        title="Filter Delivery Order"
        resetHref="/delivery-orders"
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
            <option value="selesai">Selesai</option>
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
            defaultValue={valueOf(params, "officerId") || ""}
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
