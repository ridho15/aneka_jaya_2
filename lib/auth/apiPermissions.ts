import { can, type Role } from "./roles";

export function canUploadAttachment(role: Role) {
  return can(role, "penjualan.create") || can(role, "pengeluaran.create") || can(role, "tempo.mark_paid") || can(role, "do.process");
}

export function canListProducts(role: Role) {
  return can(role, "stock.view") || can(role, "penjualan.create");
}

export function canListStocks(role: Role) {
  return can(role, "stock.view") || can(role, "penjualan.create");
}

export function canViewMasterData(role: Role) {
  return can(role, "master_data.view") || can(role, "penjualan.create");
}

export function canListRekening(role: Role) {
  return can(role, "penjualan.create") || can(role, "pengeluaran.create") || can(role, "tempo.mark_paid") || canViewMasterData(role);
}
