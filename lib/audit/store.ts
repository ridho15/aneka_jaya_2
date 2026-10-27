import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

export type AuditEntityType =
  | "sales" | "expense" | "purchase" | "product" | "stock" | "rekening" | "tipe" | "coa" | "user"
  | "tempo" | "approval" | "erp_sync" | "whatsapp_report" | "stock_alert" | "rekening_reset" | "app_setting" | "delivery_order"
  | "employee" | "employee_loan" | "employee_loan_payment" | "advance_settlement"
  | "employee_savings";

export type AuditAction =
  | "create" | "update" | "approve" | "reject" | "archive" | "disable" | "enable" | "mark_paid"
  | "partial_paid" | "cancel" | "write_off" | "reset" | "send_whatsapp" | "retry_sync" | "login" | "logout"
  | "assign_supervisor" | "deposit" | "withdrawal";

export type AuditLog = {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  beforeValue?: unknown;
  afterValue?: unknown;
  userId: string;
  userNameSnapshot: string;
  userRoleSnapshot: Role;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
  createdAt: string;
};

export type AuditListFilters = {
  role?: Role;
  from?: string;
  to?: string;
  entityType?: string;
  action?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
};

export type AuditListResult = {
  entries: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
};

type LegacyAuditInput = {
  module: "Penjualan" | "Pengeluaran" | "Data Barang";
  action: "Buat" | "Ubah";
  destination: string;
  reference: string;
  status: string;
};

const auditFile = process.env.AUDIT_TRAIL_FILE || path.join(process.cwd(), "data", "audit-trail.json");
const isProductionMode = () => process.env.NEXT_PUBLIC_APP_MODE === "production";
const SENSITIVE_KEY_PATTERN = /(authorization|cookie|token|secret|password|passwordhash|apikey|api_key|accesskey|refresh|credential|session)/i;
const PHONE_KEY_PATTERN = /(phone|whatsapp|nomor|number)/i;
const MESSAGE_BODY_PATTERN = /(messagebody|body|payload|command|request|response)/i;
const ERROR_KEY_PATTERN = /(error|errormessage|syncerror)/i;
const AUDIT_PAGE_SIZE = 50;

function clampPage(value?: number) {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : 1;
}

function clampPageSize(value?: number) {
  if (!Number.isFinite(value) || !value || value <= 0) return AUDIT_PAGE_SIZE;
  return Math.min(Math.max(Math.floor(value), 10), 100);
}

function normalizeDateBoundary(value?: string, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function maskPhone(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, "");
  if (text.length <= 4) return "***";
  return `${text.slice(0, 2)}***${text.slice(-3)}`;
}

function truncateAuditText(value: unknown, max = 160) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function summarizeObject(value: Record<string, unknown>) {
  return {
    sanitized: true,
    keys: Object.keys(value).slice(0, 20)
  };
}

export function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (depth >= 6) return `[array:${value.length}]`;
    return value.slice(0, 50).map((item) => sanitizeAuditValue(item, depth + 1));
  }
  if (typeof value !== "object") return String(value);
  if (depth >= 6) return summarizeObject(value as Record<string, unknown>);
  const source = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(source).map(([key, item]) => {
    if (SENSITIVE_KEY_PATTERN.test(key)) return [key, "[REDACTED]"];
    if (PHONE_KEY_PATTERN.test(key)) return [key, maskPhone(item)];
    if (MESSAGE_BODY_PATTERN.test(key)) {
      if (item && typeof item === "object") return [key, summarizeObject(item as Record<string, unknown>)];
      return [key, "[REDACTED]"];
    }
    if (ERROR_KEY_PATTERN.test(key)) return [key, truncateAuditText(item)];
    return [key, sanitizeAuditValue(item, depth + 1)];
  }));
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(sanitizeAuditValue(value)));
}

async function readEntries(): Promise<AuditLog[]> {
  try {
    const raw = JSON.parse(await readFile(auditFile, "utf8")) as unknown[];
    return raw.map((entry) => normalizeAudit(entry)).filter(Boolean) as AuditLog[];
  } catch {
    return [];
  }
}

function normalizeAudit(entry: unknown): AuditLog | null {
  if (!entry || typeof entry !== "object") return null;
  const value = entry as Record<string, unknown>;
  if (typeof value.entityType === "string" && typeof value.createdAt === "string") return value as AuditLog;
  if (typeof value.module === "string") {
    const entityType = value.module === "Penjualan" ? "sales" : value.module === "Pengeluaran" ? "expense" : "product";
    return {
      id: String(value.id || crypto.randomUUID()),
      entityType,
      entityId: String(value.reference || "-"),
      action: value.action === "Ubah" ? "update" : "create",
      userId: "legacy",
      userNameSnapshot: String(value.actor || "Legacy"),
      userRoleSnapshot: value.role === "ADMIN" ? "ADMIN" : "OWNER",
      reason: [value.destination, String(value.status).toLowerCase() === "mock" ? "Belum tersinkron" : value.status].filter(Boolean).join(" • "),
      createdAt: String(value.at || new Date().toISOString())
    };
  }
  return null;
}

async function appendAudit(entry: AuditLog) {
  const entries = await readEntries();
  entries.unshift(entry);
  await mkdir(path.dirname(auditFile), { recursive: true });
  await writeFile(auditFile, JSON.stringify(entries.slice(0, 10000), null, 2));
}

async function currentRequestAuditMeta(): Promise<Pick<AuditLog, "ipAddress" | "userAgent">> {
  try {
    const requestHeaders = await headers();
    const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
    return {
      ipAddress: forwardedFor || requestHeaders.get("x-real-ip") || undefined,
      userAgent: requestHeaders.get("user-agent") || undefined
    };
  } catch {
    return {};
  }
}

export async function recordAudit(entry: Omit<AuditLog, "id" | "createdAt" | "userId" | "userNameSnapshot" | "userRoleSnapshot"> | LegacyAuditInput) {
  const user = await getCurrentUser();
  const requestMeta = await currentRequestAuditMeta();
  if ("module" in entry) {
    const entityType = entry.module === "Penjualan" ? "sales" : entry.module === "Pengeluaran" ? "expense" : "product";
    const audit: AuditLog = {
      id: crypto.randomUUID(),
      entityType,
      entityId: entry.reference,
      action: entry.action === "Ubah" ? "update" : "create",
      userId: user.id,
      userNameSnapshot: user.name,
      userRoleSnapshot: user.role,
      ...requestMeta,
      reason: `${entry.destination} • ${entry.status}`,
      createdAt: new Date().toISOString()
    };
    if (isProductionMode()) {
      await prisma.auditLog.create({
        data: {
          id: audit.id,
          entityType: audit.entityType,
          entityId: audit.entityId,
          action: audit.action,
          userId: audit.userId,
          userNameSnapshot: audit.userNameSnapshot,
          userRoleSnapshot: audit.userRoleSnapshot,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
          reason: audit.reason,
          createdAt: new Date(audit.createdAt)
        }
      });
      return;
    }
    await appendAudit(audit);
    return;
  }
  const audit: AuditLog = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    userId: user.id,
    userNameSnapshot: user.name,
    userRoleSnapshot: user.role,
    ...requestMeta,
    ...entry,
    beforeValue: sanitizeAuditValue(entry.beforeValue),
    afterValue: sanitizeAuditValue(entry.afterValue)
  };
  if (isProductionMode()) {
    await prisma.auditLog.create({
      data: {
        id: audit.id,
        entityType: audit.entityType,
        entityId: audit.entityId,
        action: audit.action,
        beforeValue: toJsonValue(audit.beforeValue),
        afterValue: toJsonValue(audit.afterValue),
        userId: audit.userId,
        userNameSnapshot: audit.userNameSnapshot,
        userRoleSnapshot: audit.userRoleSnapshot,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
        reason: audit.reason,
        createdAt: new Date(audit.createdAt)
      }
    });
    return;
  }
  await appendAudit(audit);
}

function filterAuditForRole(entries: AuditLog[], role?: Role) {
  if (role === "MANAGER") return entries.filter((entry) => entry.entityType === "approval" || ["approve", "reject"].includes(entry.action));
  if (role === "FINANCE") return entries.filter((entry) => entry.entityType === "tempo" || ["mark_paid", "partial_paid"].includes(entry.action));
  return entries;
}

function applyAuditFilters(entries: AuditLog[], options?: AuditListFilters) {
  const from = normalizeDateBoundary(options?.from);
  const to = normalizeDateBoundary(options?.to, true);
  const entityType = options?.entityType?.trim();
  const action = options?.action?.trim();
  const keyword = options?.keyword?.trim().toLowerCase();
  return entries.filter((entry) => {
    const createdAt = new Date(entry.createdAt);
    if (from && createdAt < from) return false;
    if (to && createdAt > to) return false;
    if (entityType && entry.entityType !== entityType) return false;
    if (action && entry.action !== action) return false;
    if (keyword) {
      const haystack = [
        entry.entityType,
        entry.entityId,
        entry.action,
        entry.userNameSnapshot,
        entry.userRoleSnapshot,
        entry.reason
      ].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

function buildAuditWhere(options?: AuditListFilters): Prisma.AuditLogWhereInput {
  const from = normalizeDateBoundary(options?.from);
  const to = normalizeDateBoundary(options?.to, true);
  const where: Prisma.AuditLogWhereInput = {};
  if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  if (options?.entityType?.trim()) where.entityType = options.entityType.trim();
  if (options?.action?.trim()) where.action = options.action.trim();
  if (options?.keyword?.trim()) {
    const contains = options.keyword.trim();
    where.OR = [
      { entityType: { contains, mode: "insensitive" } },
      { entityId: { contains, mode: "insensitive" } },
      { action: { contains, mode: "insensitive" } },
      { userNameSnapshot: { contains, mode: "insensitive" } },
      { reason: { contains, mode: "insensitive" } }
    ];
  }
  if (options?.role === "MANAGER") {
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: [{ entityType: "approval" }, { action: { in: ["approve", "reject"] } }] }];
  }
  if (options?.role === "FINANCE") {
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: [{ entityType: "tempo" }, { action: { in: ["mark_paid", "partial_paid"] } }] }];
  }
  return where;
}

export async function listAudit(options?: AuditListFilters): Promise<AuditLog[]> {
  const result = await listAuditPaginated({ ...options, page: 1, pageSize: 10000 });
  return result.entries;
}

export async function listAuditPaginated(options?: AuditListFilters): Promise<AuditListResult> {
  const page = clampPage(options?.page);
  const pageSize = clampPageSize(options?.pageSize);
  if (isProductionMode()) {
    const where = buildAuditWhere(options);
    const [total, entries] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize })
    ]);
    return {
      entries: entries.map((entry) => ({
        ...entry,
        beforeValue: entry.beforeValue,
        afterValue: entry.afterValue,
        createdAt: entry.createdAt.toISOString()
      }) as AuditLog),
      total,
      page,
      pageSize
    };
  }
  const storedEntries =
    (await readEntries()).map((entry) => ({
      ...entry,
      beforeValue: entry.beforeValue,
      afterValue: entry.afterValue,
      createdAt: entry.createdAt
    }) as AuditLog);
  const withoutTestEntries = process.env.NODE_ENV === "test" ? storedEntries.filter((entry) => !entry.reason?.toLowerCase().includes("mock")) : storedEntries;
  const roleScoped = filterAuditForRole(withoutTestEntries, options?.role);
  const filtered = applyAuditFilters(roleScoped, options);
  const start = (page - 1) * pageSize;
  return {
    entries: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize
  };
}
