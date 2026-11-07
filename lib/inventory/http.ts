import "server-only";
import { NextResponse } from "next/server";
import type { z, ZodTypeAny } from "zod";
import { can, type Permission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { withoutCost } from "@/lib/inventory/costFields";
import { recordAudit } from "@/lib/audit/store";
import { authenticateMjRequest } from "@/lib/integrations/mj/auth";
import { MjIntegrationError } from "@/lib/integrations/mj/errors";
import { InventoryError, inventoryErrorBody } from "./errors";
import type { InventoryActor } from "./service";

export type InventoryContext = { actor: InventoryActor; source: "session" | "api"; canSeeCost: boolean };

/**
 * Token integrasi (Bearer) hanya boleh memakai operasi stok harian. Master barang, gudang/toko,
 * import Excel, dan kurs RMB tetap khusus pengguna yang login dengan hak aksesnya.
 */
const BEARER_PERMISSIONS: Permission[] = [
  "inventory.stock.view", "inventory.movement.view", "inventory.transfer", "inventory.receive", "inventory.opname", "inventory.adjust"
];



/**
 * Bungkus route inventory. Mendukung dua jenis pemanggil:
 *  - sesi user SLM (cookie) → dicek dengan permission role;
 *  - klien API eksternal dengan header `Authorization: Bearer slm_...`
 *    (token IntegrationToken, sama dengan integrasi lain).
 */
export function inventoryRoute<P extends Record<string, string> = Record<string, never>>(
  permission: Permission,
  handler: (request: Request, ctx: InventoryContext, params: P) => Promise<unknown>,
  options: { status?: number; bucket?: "read" | "mutation" } = {}
) {
  return async (request: Request, context: { params: Promise<P> }): Promise<Response> => {
    try {
      const params = ((await context?.params) ?? {}) as P;
      let ctx: InventoryContext;
      if (/^Bearer\s+/i.test(request.headers.get("authorization") || "")) {
        if (!BEARER_PERMISSIONS.includes(permission)) {
          return NextResponse.json({ success: false, message: "Token integrasi tidak boleh mengakses fitur ini.", code: "FORBIDDEN" }, { status: 403 });
        }
        const principal = await authenticateMjRequest(request, options.bucket ?? (request.method === "GET" ? "read" : "mutation"));
        ctx = { actor: { id: `api:${principal.clientCode}`, name: `API ${principal.clientCode}` }, source: "api", canSeeCost: false };
      } else {
        const user = await getCurrentUser();
        if (!can(user.role, permission)) {
          return NextResponse.json({ success: false, message: "Tidak punya akses ke modul inventory ini.", code: "FORBIDDEN" }, { status: 403 });
        }
        ctx = { actor: { id: user.id, name: user.name }, source: "session", canSeeCost: can(user.role, "inventory.master") || can(user.role, "inventory.receive") };
      }
      const raw = await handler(request, ctx, params);
      const data = ctx.canSeeCost || raw instanceof Response ? raw : withoutCost(raw);
      if (data instanceof Response) return data;
      const body = data && typeof data === "object" && "data" in data && "meta" in data ? { success: true, ...(data as object) } : { success: true, data };
      return NextResponse.json(body, { status: options.status ?? 200 });
    } catch (error) {
      if (error instanceof MjIntegrationError) {
        return NextResponse.json({ success: false, message: error.message, code: error.code, details: error.details }, { status: error.status });
      }
      const { status, body } = inventoryErrorBody(error);
      return NextResponse.json(body, { status });
    }
  };
}

export async function parseBody<S extends ZodTypeAny>(request: Request, schema: S): Promise<z.infer<S>> {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new InventoryError("VALIDATION", parsed.error.issues[0]?.message || "Data tidak valid.", 400, parsed.error.flatten());
  return parsed.data;
}

export function searchParams(request: Request) {
  const url = new URL(request.url);
  const get = (key: string) => url.searchParams.get(key) || undefined;
  const int = (key: string) => {
    const n = Number(url.searchParams.get(key));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const bool = (key: string) => ["1", "true", "yes"].includes(String(url.searchParams.get(key)).toLowerCase());
  return { get, int, bool };
}

export async function auditInventory(ctx: InventoryContext, entityId: string, reason: string, afterValue?: unknown) {
  await recordAudit({ entityType: "stock", entityId, action: "create", afterValue, reason: `${reason} oleh ${ctx.actor.name ?? "-"}` }).catch(() => undefined);
}
