import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getJournalEntry } from "@/lib/accounting/journalStore";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.view")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { id } = await params;
  try {
    const journal = await getJournalEntry(id);
    if (!journal) {
      return NextResponse.json({ success: false, message: "Jurnal tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: journal });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat detail jurnal." },
      { status: 500 }
    );
  }
}
