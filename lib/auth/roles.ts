export const ROLES = ["OWNER", "SUPERVISOR", "ADMIN", "FINANCE", "MANAGER", "DELIVERY_DRIVER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ALL_PERMISSIONS = [
  "dashboard.view", "penjualan.create", "pengeluaran.view", "pengeluaran.create", "stock.create", "stock.view",
  "penjualan.manage", "pengeluaran.manage", "stock.manage", "stock.adjust",
  "reports.view", "reports.finance_view", "settings.view", "settings.tipe.manage", "settings.rekening.manage",
  "settings.coa.manage", "settings.whatsapp.manage", "settings.profit.manage", "settings.erp_sync.manage", "users.manage", "approval.view", "approval.approve",
  "tempo.view", "tempo.mark_paid", "tempo.cancel", "tempo.write_off", "audit.view", "erp_sync.retry", "rekening.reset",
  "master_data.view", "guide.view", "do.view", "do.process", "do.assign",
  "sdm.view", "sdm.employee.manage", "sdm.kasbon.manage", "sdm.salary.view", "sdm.savings.manage",
  "accounting.view", "accounting.journal.manage", "accounting.coa.manage", "accounting.period.manage", "accounting.rates.manage",
  "purchasing.view", "purchasing.order.manage", "purchasing.invoice.manage", "purchasing.payment.manage"
] as const;
export type Permission = (typeof ALL_PERMISSIONS)[number];

export const ROLE_COOKIE = "aneka_jaya_role";

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Super Admin",
  SUPERVISOR: "Supervisor",
  ADMIN: "Admin",
  FINANCE: "Finance",
  MANAGER: "Manager",
  DELIVERY_DRIVER: "Petugas DO",
  VIEWER: "Viewer"
};

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: [...ALL_PERMISSIONS],
  SUPERVISOR: ALL_PERMISSIONS.filter((p) => p !== "reports.view" && p !== "reports.finance_view" && p !== "sdm.salary.view"),
  ADMIN: [
    "penjualan.create", "penjualan.manage", "do.view", "do.process", "do.assign"
  ],
  FINANCE: [
    "pengeluaran.view", "pengeluaran.create", "tempo.view", "tempo.mark_paid",
    "reports.finance_view", "master_data.view", "guide.view",
    "sdm.view", "sdm.kasbon.manage", "sdm.salary.view", "sdm.savings.manage",
    "accounting.view", "accounting.journal.manage", "accounting.coa.manage", "accounting.rates.manage",
    "purchasing.view", "purchasing.order.manage", "purchasing.invoice.manage", "purchasing.payment.manage"
  ],
  MANAGER: [
    "pengeluaran.view", "approval.view", "approval.approve", "tempo.view",
    "reports.finance_view", "audit.view", "master_data.view", "guide.view",
    "sdm.view", "sdm.employee.manage", "sdm.savings.manage",
    "accounting.view", "accounting.period.manage",
    "purchasing.view", "purchasing.order.manage", "purchasing.invoice.manage"
  ],
  DELIVERY_DRIVER: ["do.view", "do.process"],
  VIEWER: []
};

export function parseRole(value?: string | null, fallback: Role = "VIEWER"): Role {
  if (!value || typeof value !== "string") return fallback;
  const upper = value.trim().toUpperCase() as Role;
  return ROLES.includes(upper) ? upper : fallback;
}

export function roleLabel(role: Role) {
  return ROLE_LABEL[role];
}

export function can(role: Role | { role: Role }, permission: Permission) {
  const resolvedRole = typeof role === "string" ? role : role.role;
  return ROLE_PERMISSIONS[resolvedRole]?.includes(permission) ?? false;
}

export function landingPageForRole(role: Role) {
  if (role === "OWNER" || role === "SUPERVISOR") return "/dashboard";
  if (role === "ADMIN") return "/penjualan/input";
  if (role === "FINANCE") return "/tempo";
  if (role === "MANAGER") return "/approval";
  if (role === "DELIVERY_DRIVER") return "/delivery-orders";
  return "/no-access";
}

