import "server-only";
import { listErpPaginated } from "@/lib/api/pagination";
import type { ApiResponse } from "@/lib/types/api";

export type ErpReferenceOption = {
  id: number;
  name: string;
  code?: string;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function numberId(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return undefined;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toReferenceOption(row: unknown): ErpReferenceOption | undefined {
  const item = asRecord(row);
  const id = numberId(item?.id);
  const name = text(item?.name) ?? text(item?.abbreviation) ?? text(item?.kode) ?? text(item?.code);
  if (!id || !name) return undefined;
  return { id, name, code: text(item?.kode) ?? text(item?.code) ?? text(item?.abbreviation) };
}

function uniqueById(rows: ErpReferenceOption[]) {
  return Array.from(new Map(rows.map((row) => [row.id, row])).values());
}

export async function listProductCategories(): Promise<ApiResponse<ErpReferenceOption[]>> {
  const response = await listErpPaginated("/product-categories", { maxPages: 5 });
  if (!response.success) return response;
  return { success: true, data: uniqueById(response.data.map(toReferenceOption).filter((item): item is ErpReferenceOption => Boolean(item))) };
}

export async function listUnitOfMeasures(): Promise<ApiResponse<ErpReferenceOption[]>> {
  const response = await listErpPaginated("/unit-of-measures", { maxPages: 5 });
  if (!response.success) return response;
  return { success: true, data: uniqueById(response.data.map(toReferenceOption).filter((item): item is ErpReferenceOption => Boolean(item))) };
}
