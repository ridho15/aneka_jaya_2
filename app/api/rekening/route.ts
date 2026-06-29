import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listRekeningAccounts, saveRekeningAccounts } from "@/lib/business/masterData";
import { recordAudit } from "@/lib/audit/store";

export async function GET(request: Request) {
  const role = await getCurrentRole();
  if (!can(role, "settings.rekening.manage") && !can(role, "tempo.mark_paid")) return NextResponse.json({ success: false, message: "Tidak punya akses lihat Rekening." }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const tipeId = searchParams.get("tipeId");
  const all = await listRekeningAccounts();
  const data = tipeId ? all.filter((r) => r.tipeIds.includes(tipeId)) : all;
  return NextResponse.json({ success: true, data });
}

export async function POST(request: Request) {
  const role = await getCurrentRole();
  if (!can(role, "settings.rekening.manage")) return NextResponse.json({ success: false, message: "Tidak punya akses kelola Rekening." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body?.name || !body?.bank) return NextResponse.json({ success: false, message: "Nama dan bank rekening wajib diisi." }, { status: 400 });
  const all = await listRekeningAccounts();
  const newRek = { id: `rek-${Date.now()}`, bank: String(body.bank).trim(), name: String(body.name).trim(), accountNumber: String(body.accountNumber || "-").trim(), isCash: body.bank === "Cash", tipeIds: Array.isArray(body.tipeIds) ? body.tipeIds : [] };
  all.push(newRek);
  await saveRekeningAccounts(all);
  await recordAudit({ entityType: "rekening", entityId: newRek.id, action: "create", afterValue: newRek, reason: "Rekening baru ditambahkan" });
  return NextResponse.json({ success: true, data: newRek }, { status: 201 });
}

export async function PUT(request: Request) {
  const role = await getCurrentRole();
  if (!can(role, "settings.rekening.manage")) return NextResponse.json({ success: false, message: "Tidak punya akses kelola Rekening." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ success: false, message: "ID rekening diperlukan." }, { status: 400 });
  const all = await listRekeningAccounts();
  const index = all.findIndex((r) => r.id === body.id);
  if (index < 0) return NextResponse.json({ success: false, message: "Rekening tidak ditemukan." }, { status: 404 });
  const before = all[index];
  const after = { ...before, ...body };
  all[index] = after;
  await saveRekeningAccounts(all);
  await recordAudit({ entityType: "rekening", entityId: after.id, action: "update", beforeValue: before, afterValue: after });
  return NextResponse.json({ success: true, data: after });
}
