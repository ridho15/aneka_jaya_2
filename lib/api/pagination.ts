import "server-only";
import { anikaRequest } from "./anikaClient";
import type { ApiResponse } from "@/lib/types/api";
import { failure } from "@/lib/types/api";

const DEFAULT_PER_PAGE = 100;
const DEFAULT_MAX_PAGES = 10;

type PaginatedBody = {
  data?: unknown;
  meta?: {
    current_page?: number;
    last_page?: number;
    per_page?: number;
    total?: number;
  };
};

export type ErpPageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ErpPage = {
  data: unknown[];
  meta: ErpPageMeta;
};

function pathWithQuery(path: string, params: Record<string, string | number | boolean | undefined>) {
  const [pathname, existingQuery = ""] = path.split("?");
  const search = new URLSearchParams(existingQuery);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function rowsFrom(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  const data = (body as PaginatedBody | null)?.data;
  return Array.isArray(data) ? data : null;
}

function shouldStop(body: unknown, rows: unknown[], page: number, perPage: number) {
  const meta = (body as PaginatedBody | null)?.meta;
  if (meta?.last_page && page >= meta.last_page) return true;
  if (meta?.total !== undefined && page * (meta.per_page || perPage) >= meta.total) return true;
  return rows.length < perPage;
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

export async function listErpPage(
  path: string,
  options: { page?: number; perPage?: number; query?: Record<string, string | number | boolean | undefined> } = {}
): Promise<ApiResponse<ErpPage>> {
  const requestedPage = positiveInteger(options.page) ?? 1;
  const requestedPageSize = positiveInteger(options.perPage) ?? DEFAULT_PER_PAGE;
  const response = await anikaRequest<unknown>(pathWithQuery(path, {
    ...options.query,
    per_page: requestedPageSize,
    page: requestedPage
  }));
  if (!response.success) return response;

  const rows = rowsFrom(response.data);
  if (!rows) return failure("Format data ERP tidak dikenali.", "ERP_SCHEMA");

  const upstream = (response.data as PaginatedBody | null)?.meta;
  const page = positiveInteger(upstream?.current_page) ?? requestedPage;
  const pageSize = positiveInteger(upstream?.per_page) ?? requestedPageSize;
  const offset = (page - 1) * pageSize;
  const inferredTotal = offset + rows.length + (rows.length === pageSize ? 1 : 0);
  const total = positiveInteger(upstream?.total) ?? inferredTotal;
  const totalPages = positiveInteger(upstream?.last_page) ?? Math.max(page, Math.ceil(total / pageSize), 1);

  return {
    success: true,
    data: {
      data: rows,
      meta: { page, pageSize, total, totalPages }
    }
  };
}

export async function listErpPaginated(path: string, options: { perPage?: number; maxPages?: number; query?: Record<string, string | number | boolean | undefined> } = {}): Promise<ApiResponse<unknown[]>> {
  const perPage = options.perPage ?? DEFAULT_PER_PAGE;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const allRows: unknown[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await anikaRequest<unknown>(pathWithQuery(path, { ...options.query, per_page: perPage, page }));
    if (!response.success) return response;

    const rows = rowsFrom(response.data);
    if (!rows) return failure("Format data ERP tidak dikenali.", "ERP_SCHEMA");
    allRows.push(...rows);
    if (rows.length === 0 || shouldStop(response.data, rows, page, perPage)) break;
  }

  return { success: true, data: allRows };
}
