export const ROLES = ["OWNER", "ADMIN", "FINANCE", "MANAGER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ALL_PERMISSIONS = [
  "dashboard.view", "penjualan.create", "pengeluaran.view", "pengeluaran.create", "stock.create", "stock.view",
  "penjualan.manage", "pengeluaran.manage", "stock.manage", "stock.adjust",
  "reports.view", "reports.finance_view", "settings.view", "settings.tipe.manage", "settings.rekening.manage",
  "settings.coa.manage", "settings.whatsapp.manage", "settings.profit.manage", "settings.erp_sync.manage", "users.manage", "approval.view", "approval.approve",
  "tempo.view", "tempo.mark_paid", "tempo.cancel", "tempo.write_off", "audit.view", "erp_sync.retry", "rekening.reset",
  "master_data.view", "guide.view"
] as const;
export type Permission = (typeof ALL_PERMISSIONS)[number];

export const ROLE_COOKIE = "aneka_jaya_role";

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Super Admin",
  ADMIN: "Admin",
  FINANCE: "Finance",
  MANAGER: "Manager",
  VIEWER: "Viewer"
};

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: [...ALL_PERMISSIONS],
  ADMIN: ["penjualan.create", "penjualan.manage"],
  FINANCE: ["pengeluaran.view", "pengeluaran.create", "tempo.view", "tempo.mark_paid", "reports.finance_view", "master_data.view", "guide.view"],
  MANAGER: ["pengeluaran.view", "approval.view", "approval.approve", "tempo.view", "reports.finance_view", "audit.view", "master_data.view", "guide.view"],
  VIEWER: []
};

export function parseRole(value?: string | null, fallback: Role = "VIEWER"): Role {
  return ROLES.includes(value as Role) ? (value as Role) : fallback;
}

export function roleLabel(role: Role) {
  return ROLE_LABEL[role];
}

export function can(role: Role | { role: Role }, permission: Permission) {
  const resolvedRole = typeof role === "string" ? role : role.role;
  return ROLE_PERMISSIONS[resolvedRole].includes(permission);
}

export function landingPageForRole(role: Role) {
  if (role === "OWNER") return "/dashboard";
  if (role === "ADMIN") return "/penjualan/input";
  if (role === "FINANCE") return "/tempo";
  if (role === "MANAGER") return "/approval";
  return "/no-access";
}
