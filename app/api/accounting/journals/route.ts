import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { listJournalEntries, createManualJournalEntry } from "@/lib/accounting/journalStore";
import { manualJournalSchema } from "@/lib/validation/accountingSchema";
import type { JournalStatus } from "@prisma/client";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.view")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const sourceType = searchParams.get("sourceType") || undefined;
  const status = (searchParams.get("status") as JournalStatus) || undefined;
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;
  const search = searchParams.get("search") || undefined;
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 100;
  const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : 0;

  try {
    const result = await listJournalEntries({
      sourceType,
      status,
      startDate,
      endDate,
      keyword: search,
      pageSize: limit,
      page: Math.floor(offset / limit) + 1,
    });
    return NextResponse.json({ success: true, data: result.entries, total: result.total });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat jurnal." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.journal.manage")) {
    return NextResponse.json(
      { success: false, message: "Akses ditolak. Memerlukan hak akses kelola jurnal." },
      { status: 403 }
    );
  }

  try {
    const json = await request.json();
    const validated = manualJournalSchema.parse(json);
    const journal = await createManualJournalEntry(validated, {
      id: user.id,
      name: user.name,
      role: user.role,
    });
    return NextResponse.json({ success: true, data: journal }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal menyimpan jurnal." },
      { status: 400 }
    );
  }
}
