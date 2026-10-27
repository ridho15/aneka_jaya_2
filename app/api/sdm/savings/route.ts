import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import {
  listSavingsAccounts,
  getOrCreateSavingsAccount,
  getSavingsSummary
} from "@/lib/sdm/savingsStore";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "sdm.view")) {
    return NextResponse.json(
      { success: false, message: "Tidak memiliki hak akses melihat data simpanan karyawan." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const isActiveParam = searchParams.get("isActive");
  const keyword = searchParams.get("keyword") || undefined;
  const isActive = isActiveParam === "true" ? true : isActiveParam === "false" ? false : undefined;

  try {
    const [accounts, summary] = await Promise.all([
      listSavingsAccounts({ isActive, keyword }),
      getSavingsSummary()
    ]);

    return NextResponse.json({
      success: true,
      data: {
        accounts,
        summary
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Gagal memuat daftar rekening simpanan." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "sdm.savings.manage") && !can(user.role, "sdm.employee.manage")) {
    return NextResponse.json(
      { success: false, message: "Tidak memiliki hak akses membuka rekening simpanan." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body?.employeeId) {
    return NextResponse.json(
      { success: false, message: "ID Karyawan wajib disertakan." },
      { status: 400 }
    );
  }

  try {
    const account = await getOrCreateSavingsAccount(body.employeeId, body.notes);
    return NextResponse.json({ success: true, data: account }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Gagal membuka rekening simpanan." },
      { status: 400 }
    );
  }
}
