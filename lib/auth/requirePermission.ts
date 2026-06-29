import "server-only";
import { redirect } from "next/navigation";
import { can, type Permission, type Role } from "./roles";
import { getCurrentRole } from "./session";

type PermissionInput = Permission | Permission[];

export async function requirePermission(permission: PermissionInput, fallback = "/no-access"): Promise<Role> {
  const role = await getCurrentRole();
  const allowed = Array.isArray(permission)
    ? permission.some((item) => can(role, item))
    : can(role, permission);
  if (!allowed) redirect(fallback);
  return role;
}
