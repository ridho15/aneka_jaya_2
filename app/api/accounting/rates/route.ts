import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { listRates, upsertRate, deleteRate } from "@/lib/currency/ratesStore";
import { CurrencyRateSchema } from "@/lib/validation/purchasingSchema";
import type { RateType } from "@prisma/client";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.view")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const currency = searchParams.get("currency") || undefined;
  const rateType = (searchParams.get("rateType") as RateType) || undefined;
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;

  try {
    const rates = await listRates({ currency, rateType, startDate, endDate });
    return NextResponse.json({ success: true, data: rates });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat kurs." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.rates.manage")) {
    return NextResponse.json({ success: false, message: "Akses ditolak. Memerlukan hak akses kelola kurs." }, { status: 403 });
  }

  try {
    const json = await request.json();
    const validated = CurrencyRateSchema.parse(json);
    const saved = await upsertRate(validated, {
      userId: user.id,
      role: user.role
    });
    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal menyimpan kurs." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.rates.manage")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, message: "ID kurs wajib disertakan." }, { status: 400 });
  }

  try {
    await deleteRate(id, { userId: user.id, role: user.role });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal menghapus kurs." },
      { status: 400 }
    );
  }
}
