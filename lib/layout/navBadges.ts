import "server-only";
import { prisma } from "@/lib/db/prisma";
import { can, type Role } from "@/lib/auth/roles";
import { getTempoMetricsSummary } from "@/lib/tempo/store";

export type NavBadge = { count: number; title: string };
export type NavBadges = Partial<Record<string, NavBadge>>;

async function safe<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch {
    return null;
  }
}

/** Angka kecil di menu: hal yang perlu ditindaklanjuti. Gagal hitung = tanpa angka, halaman tetap tampil. */
export async function getNavBadges(role: Role): Promise<NavBadges> {
  const badges: NavBadges = {};
  const canTempo = can(role, "tempo.view");
  const canTempoDue = can(role, "tempo.view_due");
  const [openDo, tempo] = await Promise.all([
    can(role, "do.view") ? safe(() => prisma.deliveryOrder.count({ where: { status: { not: "selesai" } } })) : null,
    canTempo || canTempoDue ? safe(() => getTempoMetricsSummary({})) : null
  ]);
  if (openDo) badges.do = { count: openDo, title: `${openDo} Delivery Order belum selesai` };
  if (tempo) {
    // Admin hanya melihat daftar jatuh tempo 3 hari ke depan, jadi angkanya disamakan dengan daftar itu.
    const count = canTempo ? tempo.overdue.count + tempo.comingSoonH3.count : tempo.comingSoonH3.count;
    if (count) badges.tempo = { count, title: canTempo ? `${count} nota tempo lewat jatuh tempo atau jatuh tempo ≤ 3 hari` : `${count} nota jatuh tempo ≤ 3 hari` };
  }
  return badges;
}
