import type { Prisma } from "@prisma/client";

/**
 * Jurnal yang ikut dihitung di buku besar & laporan. Jurnal asli yang dibalik tetap dihitung
 * bersama jurnal pembaliknya (status POSTED) sehingga keduanya saling meniadakan; kalau hanya
 * POSTED, pembatalan mengurangi saldo dua kali.
 */
export const LEDGER_JOURNAL_STATUS: Prisma.JournalEntryWhereInput["status"] = { in: ["POSTED", "REVERSED"] };
