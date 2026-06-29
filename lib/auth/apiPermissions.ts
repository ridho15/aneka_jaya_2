import { can, type Role } from "./roles";

export function canUploadAttachment(role: Role) {
  return can(role, "penjualan.create") || can(role, "pengeluaran.create") || can(role, "tempo.mark_paid");
}

export function canListProducts(role: Role) {
  return can(role, "stock.view");
}
