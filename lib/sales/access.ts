import "server-only";
import { can } from "@/lib/auth/roles";
import type { CurrentUser } from "@/lib/auth/session";
import type { Sale } from "@/lib/types/sales";
import {
  getSalesRecord,
  listSalesRecordsPage,
  type PaginatedSalesRecords,
  type SalesRecordFilters,
  type SalesRecordScope,
} from "./store";

type SalesListInput = {
  page?: number;
  pageSize?: number;
  filters?: SalesRecordFilters;
};

export function salesRecordScopeForUser(user: CurrentUser): SalesRecordScope | undefined {
  if (user.role === "OWNER") return undefined;
  return user.role === "ADMIN" ? { createdByUserId: user.id, excludeSource: "MJ" } : { excludeSource: "MJ" };
}

export function canViewSalesRecord(user: CurrentUser, sale: Sale): boolean {
  if (!can(user.role, "penjualan.create") && !can(user.role, "reports.view")) return false;
  if (sale.source === "MJ" && user.role !== "OWNER") return false;
  return user.role !== "ADMIN" || sale.createdByUserId === user.id;
}

export async function listSalesRecordsPageForUser(
  user: CurrentUser,
  input: SalesListInput = {},
): Promise<PaginatedSalesRecords> {
  return listSalesRecordsPage({ ...input, scope: salesRecordScopeForUser(user) });
}

export async function getSalesRecordForUser(id: string, user: CurrentUser): Promise<Sale | undefined> {
  const sale = await getSalesRecord(id);
  return sale && canViewSalesRecord(user, sale) ? sale : undefined;
}
