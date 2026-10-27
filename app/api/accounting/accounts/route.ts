import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { listAccounts, createAccount } from "@/lib/accounting/accountStore";
import { accountSchema } from "@/lib/validation/accountingSchema";
import type { AccountCategory } from "@prisma/client";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.view")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const category = (searchParams.get("category") as AccountCategory) || undefined;
  const search = searchParams.get("search") || undefined;
  const isActiveParam = searchParams.get("isActive");
  const isActive = isActiveParam !== null ? isActiveParam === "true" : undefined;

  try {
    const accounts = await listAccounts({ category, keyword: search, isActive });
    return NextResponse.json({ success: true, data: accounts });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat akun." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.coa.manage")) {
    return NextResponse.json({ success: false, message: "Akses ditolak. Memerlukan hak akses kelola COA." }, { status: 403 });
  }

  try {
    const json = await request.json();
    const validated = accountSchema.parse(json);
    const account = await createAccount(validated, {
      id: user.id,
      name: user.name,
      role: user.role,
    });
    return NextResponse.json({ success: true, data: account }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal membuat akun." },
      { status: 400 }
    );
  }
}
