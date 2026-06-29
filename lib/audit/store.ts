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
  | "tempo" | "approval" | "erp_sync" | "whatsapp_report" | "stock_alert" | "rekening_reset";

export type AuditAction =
  | "create" | "update" | "approve" | "reject" | "archive" | "disable" | "enable" | "mark_paid"
  | "partial_paid" | "cancel" | "write_off" | "reset" | "send_whatsapp" | "retry_sync" | "login" | "logout";

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

type LegacyAuditInput = {
  module: "Penjualan" | "Pengeluaran" | "Data Barang";
  action: "Buat" | "Ubah";
  destination: string;
  reference: string;
  status: string;
};

const auditFile = process.env.AUDIT_TRAIL_FILE || path.join(process.cwd(), "data", "audit-trail.json");
const isProductionMode = () => process.env.NEXT_PUBLIC_APP_MODE === "production";

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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
    ...entry
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

export async function listAudit(options?: { role?: Role }): Promise<AuditLog[]> {
  const storedEntries = isProductionMode()
    ? (await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10000 })).map((entry) => ({
      ...entry,
      beforeValue: entry.beforeValue,
      afterValue: entry.afterValue,
      createdAt: entry.createdAt.toISOString()
    }) as AuditLog)
    : await readEntries();
  const entries = storedEntries.filter((entry) => !entry.reason?.toLowerCase().includes("mock"));
  if (options?.role === "MANAGER") return entries.filter((entry) => entry.entityType === "approval" || ["approve", "reject"].includes(entry.action));
  if (options?.role === "FINANCE") return entries.filter((entry) => entry.entityType === "tempo" || ["mark_paid", "partial_paid"].includes(entry.action));
  return entries;
}
