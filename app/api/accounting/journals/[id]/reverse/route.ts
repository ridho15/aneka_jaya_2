import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { reverseJournalEntry } from "@/lib/accounting/journalStore";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.journal.manage")) {
    return NextResponse.json(
      { success: false, message: "Akses ditolak. Memerlukan hak akses kelola jurnal." },
      { status: 403 }
    );
  }

  const { id } = await params;
  try {
    const json = await request.json().catch(() => ({}));
    const reason = typeof json?.reason === "string" ? json.reason.trim() : "";
    if (!reason) {
      return NextResponse.json({ success: false, message: "Alasan pembalikan jurnal (reversal) wajib diisi." }, { status: 400 });
    }

    const reversal = await reverseJournalEntry(
      id,
      {
        id: user.id,
        name: user.name,
        role: user.role,
      },
      reason
    );

    return NextResponse.json({ success: true, data: reversal, message: "Jurnal berhasil dibalik." });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal membalik jurnal." },
      { status: 400 }
    );
  }
}
