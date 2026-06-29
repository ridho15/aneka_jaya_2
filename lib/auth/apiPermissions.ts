import { can, type Role } from "./roles";

export function canUploadAttachment(role: Role) {
  return can(role, "penjualan.create") || can(role, "pengeluaran.create") || can(role, "tempo.mark_paid");
}

export function canListProducts(role: Role) {
  return can(role, "stock.view");
}

export function canViewMasterData(role: Role) {
  return can(role, "master_data.view");
}

export function canListRekening(role: Role) {
  return can(role, "penjualan.create") || can(role, "pengeluaran.create") || can(role, "tempo.mark_paid") || canViewMasterData(role);
}
