import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import {
  listSavingsTransactions,
  depositSavings,
  withdrawSavings
} from "@/lib/sdm/savingsStore";
import type { SavingsTransactionType } from "@prisma/client";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "sdm.view")) {
    return NextResponse.json(
      { success: false, message: "Tidak memiliki hak akses melihat transaksi simpanan." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId") || undefined;
  const savingsAccountId = searchParams.get("savingsAccountId") || undefined;
  const typeParam = searchParams.get("type");
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;
  const limitParam = searchParams.get("limit");

  const type = typeParam === "DEPOSIT" || typeParam === "WITHDRAWAL"
    ? (typeParam as SavingsTransactionType)
    : undefined;
  const limit = limitParam ? parseInt(limitParam, 10) : 100;

  try {
    const transactions = await listSavingsTransactions({
      employeeId,
      savingsAccountId,
      type,
      startDate,
      endDate,
      limit
    });

    return NextResponse.json({ success: true, data: transactions });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Gagal memuat transaksi simpanan." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "sdm.savings.manage") && !can(user.role, "sdm.kasbon.manage")) {
    return NextResponse.json(
      { success: false, message: "Tidak memiliki hak akses memproses transaksi simpanan." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { success: false, message: "Payload request tidak valid." },
      { status: 400 }
    );
  }

  const { action, employeeId, amount, transactionDate, rekeningAccountId, notes, source } = body;

  if (!employeeId) {
    return NextResponse.json(
      { success: false, message: "Karyawan wajib dipilih." },
      { status: 400 }
    );
  }

  const parsedAmount = Number(amount);
  if (!parsedAmount || parsedAmount <= 0 || isNaN(parsedAmount)) {
    return NextResponse.json(
      { success: false, message: "Nominal transaksi harus lebih dari 0." },
      { status: 400 }
    );
  }

  const dateValue = transactionDate || new Date().toISOString();
  const actor = { id: user.id, name: user.name, role: user.role };

  try {
    if (action === "deposit") {
      const result = await depositSavings(
        {
          employeeId,
          amount: parsedAmount,
          transactionDate: dateValue,
          rekeningAccountId,
          notes,
          source
        },
        actor
      );
      return NextResponse.json({ success: true, data: result }, { status: 201 });
    } else if (action === "withdrawal") {
      const result = await withdrawSavings(
        {
          employeeId,
          amount: parsedAmount,
          transactionDate: dateValue,
          rekeningAccountId,
          notes
        },
        actor
      );
      return NextResponse.json({ success: true, data: result }, { status: 201 });
    } else {
      return NextResponse.json(
        { success: false, message: "Aksi tidak dikenali. Pilih 'deposit' atau 'withdrawal'." },
        { status: 400 }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Gagal memproses transaksi simpanan." },
      { status: 400 }
    );
  }
}
