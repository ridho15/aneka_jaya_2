import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { canListRekening } from "@/lib/auth/apiPermissions";
import { listAllRekeningAccounts, listBookkeepingTypes, listRekeningAccounts, saveRekeningAccounts } from "@/lib/business/masterData";
import { recordAudit } from "@/lib/audit/store";
import { INDONESIAN_BANKS } from "@/lib/paymentAccounts";
import { rekeningCreateSchema, rekeningUpdateSchema, validationMessage } from "@/lib/validation/settingsSchema";

const validBanks = INDONESIAN_BANKS as readonly string[];

async function validateTipeIds(tipeIds: string[]) {
  const types = await listBookkeepingTypes();
  const validIds = new Set(types.map((type) => type.id));
  const invalid = tipeIds.find((id) => !validIds.has(id));
  return invalid ? `Tipe ${invalid} tidak ditemukan.` : null;
}

export async function GET(request: Request) {
  const role = await getCurrentRole();
  if (!can(role, "settings.rekening.manage") && !canListRekening(role)) return NextResponse.json({ success: false, message: "Tidak punya akses lihat Rekening." }, { status: 403 });
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
  const parsed = rekeningCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: validationMessage(parsed.error, "Nama dan bank rekening wajib diisi.") }, { status: 400 });
  if (!validBanks.includes(parsed.data.bank)) return NextResponse.json({ success: false, message: "Bank rekening tidak valid." }, { status: 400 });
  const tipeError = await validateTipeIds(parsed.data.tipeIds);
  if (tipeError) return NextResponse.json({ success: false, message: tipeError }, { status: 400 });
  const all = await listAllRekeningAccounts();
  const newRek = { id: `rek-${Date.now()}`, bank: parsed.data.bank, name: parsed.data.name, accountNumber: parsed.data.accountNumber, isCash: parsed.data.bank === "Cash", isActive: true, tipeIds: parsed.data.tipeIds };
  all.push(newRek);
  await saveRekeningAccounts(all);
  await recordAudit({ entityType: "rekening", entityId: newRek.id, action: "create", afterValue: newRek, reason: "Rekening baru ditambahkan" });
  return NextResponse.json({ success: true, data: newRek }, { status: 201 });
}

export async function PUT(request: Request) {
  const role = await getCurrentRole();
  if (!can(role, "settings.rekening.manage")) return NextResponse.json({ success: false, message: "Tidak punya akses kelola Rekening." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = rekeningUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: validationMessage(parsed.error, "Data rekening tidak valid.") }, { status: 400 });
  if (parsed.data.bank && !validBanks.includes(parsed.data.bank)) return NextResponse.json({ success: false, message: "Bank rekening tidak valid." }, { status: 400 });
  if (parsed.data.tipeIds) {
    const tipeError = await validateTipeIds(parsed.data.tipeIds);
    if (tipeError) return NextResponse.json({ success: false, message: tipeError }, { status: 400 });
  }
  const all = await listAllRekeningAccounts();
  const index = all.findIndex((r) => r.id === parsed.data.id);
  if (index < 0) return NextResponse.json({ success: false, message: "Rekening tidak ditemukan." }, { status: 404 });
  const before = all[index];
  const after = { ...before, ...parsed.data, isCash: (parsed.data.bank || before.bank) === "Cash" };
  all[index] = after;
  await saveRekeningAccounts(all);
  await recordAudit({ entityType: "rekening", entityId: after.id, action: "update", beforeValue: before, afterValue: after });
  return NextResponse.json({ success: true, data: after });
}
