import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma, JournalStatus } from "@prisma/client";
import { assertPeriodOpen } from "@/lib/accounting/periodStore";
import { getAccountById, ensureStandardAccounts } from "@/lib/accounting/accountStore";
import type { ManualJournalInput } from "@/lib/validation/accountingSchema";
import { recordAudit } from "@/lib/audit/store";
import type { Role } from "@/lib/auth/roles";
import { jakartaMonthKey, jakartaDateKey } from "@/lib/date/jakarta";

export type JournalLineInput = {
  accountId: string;
  accountCodeSnapshot?: string;
  accountNameSnapshot?: string;
  debit: number;
  credit: number;
  memo?: string | null;
  sortOrder?: number;
};

export type PostJournalInput = {
  entryDate: Date | string;
  sourceType: string;
  sourceId: string;
  postingType: string;
  tipeId?: string | null;
  tipeCodeSnapshot?: string | null;
  description: string;
  attachmentUrl?: string | null;
  lines: JournalLineInput[];
};

export async function generateNextJournalNumber(
  dateValue: Date | string,
  prefix = "JRN",
  client: any = prisma
): Promise<string> {
  const periodKey = jakartaMonthKey(dateValue).replace("-", ""); // e.g. 202610
  const prefixPattern = `${prefix}-${periodKey}-`;

  const latest = await client.journalEntry.findFirst({
    where: {
      journalNumber: {
        startsWith: prefixPattern
      }
    },
    orderBy: {
      journalNumber: "desc"
    },
    select: {
      journalNumber: true
    }
  });

  let nextNum = 1;
  if (latest?.journalNumber) {
    const parts = latest.journalNumber.split("-");
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) {
      nextNum = lastSeq + 1;
    }
  }

  const nextSeq = String(nextNum).padStart(4, "0");
  return `${prefix}-${periodKey}-${nextSeq}`;
}

export async function postJournalEntry(
  input: PostJournalInput,
  actor: { id: string; name: string; role: Role }
) {
  await ensureStandardAccounts();
  const dateObj = typeof input.entryDate === "string" ? new Date(input.entryDate) : input.entryDate;
  await assertPeriodOpen(dateObj);

  // 1. Idempotency check: jika jurnal untuk sumber & postingType ini sudah ada, kembalikan entri yang ada
  const existing = await prisma.journalEntry.findUnique({
    where: {
      sourceType_sourceId_postingType: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        postingType: input.postingType
      }
    },
    include: { lines: { orderBy: { sortOrder: "asc" } } }
  });
  if (existing) {
    return existing;
  }

  // 2. Equilibrium check (Debit == Credit)
  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of input.lines) {
    totalDebit += Number(line.debit) || 0;
    totalCredit += Number(line.credit) || 0;
  }

  const diff = Math.abs(totalDebit - totalCredit);
  if (diff > 0.01 || totalDebit <= 0) {
    throw new Error(
      `Jurnal tidak seimbang: Total Debit (Rp ${totalDebit.toLocaleString("id-ID")}) harus tepat sama dengan Total Kredit (Rp ${totalCredit.toLocaleString("id-ID")}) dan lebih besar dari 0.`
    );
  }

  // 3. Resolve account snapshots for each line
  const resolvedLines: Array<{
    accountId: string;
    accountCodeSnapshot: string;
    accountNameSnapshot: string;
    debit: number;
    credit: number;
    memo?: string | null;
    sortOrder: number;
  }> = [];

  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i];
    let code = line.accountCodeSnapshot;
    let name = line.accountNameSnapshot;

    if (!code || !name) {
      const acc = await getAccountById(line.accountId);
      if (!acc) throw new Error(`Akun perkiraan dengan ID ${line.accountId} tidak ditemukan.`);
      code = acc.code;
      name = acc.name;
    }

    resolvedLines.push({
      accountId: line.accountId,
      accountCodeSnapshot: code,
      accountNameSnapshot: name,
      debit: Number(line.debit) || 0,
      credit: Number(line.credit) || 0,
      memo: line.memo || null,
      sortOrder: line.sortOrder ?? i
    });
  }

  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const journalNumber = await generateNextJournalNumber(dateObj, "JRN", tx);

        const journal = await tx.journalEntry.create({
          data: {
            journalNumber,
            entryDate: dateObj,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            postingType: input.postingType,
            tipeId: input.tipeId || null,
            tipeCodeSnapshot: input.tipeCodeSnapshot || null,
            description: input.description,
            status: "POSTED",
            totalDebit,
            totalCredit,
            isReversal: false,
            attachmentUrl: input.attachmentUrl || null,
            createdByUserId: actor.id,
            createdByNameSnapshot: actor.name,
            lines: {
              create: resolvedLines.map((l) => ({
                accountId: l.accountId,
                accountCodeSnapshot: l.accountCodeSnapshot,
                accountNameSnapshot: l.accountNameSnapshot,
                debit: l.debit,
                credit: l.credit,
                memo: l.memo,
                sortOrder: l.sortOrder
              }))
            }
          },
          include: {
            lines: { orderBy: { sortOrder: "asc" } }
          }
        });

        await tx.auditLog.create({
          data: {
            id: crypto.randomUUID(),
            entityType: "coa",
            entityId: journal.id,
            action: "create",
            afterValue: JSON.parse(JSON.stringify(journal)),
            userId: actor.id,
            userNameSnapshot: actor.name,
            userRoleSnapshot: actor.role,
            reason: `Posting jurnal ${journal.journalNumber} (${input.description}) - Total: Rp ${totalDebit.toLocaleString("id-ID")}`
          }
        });

        return journal;
      });
    } catch (err: any) {
      if (err?.code === "P2002" && attempt < maxRetries) {
        await new Promise((res) => setTimeout(res, 25 * attempt + Math.floor(Math.random() * 30)));
        continue;
      }
      throw err;
    }
  }

  throw new Error("Gagal membukukan jurnal setelah beberapa percobaan.");
}

export async function createManualJournalEntry(
  input: ManualJournalInput,
  actor: { id: string; name: string; role: Role }
) {
  const manualId = `MANUAL-${crypto.randomUUID()}`;
  return postJournalEntry(
    {
      entryDate: input.entryDate,
      sourceType: "MANUAL",
      sourceId: manualId,
      postingType: "MANUAL",
      tipeId: input.tipeId || null,
      description: input.description,
      attachmentUrl: input.attachmentUrl || null,
      lines: input.lines.map((l, idx) => ({
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        memo: l.memo,
        sortOrder: idx
      }))
    },
    actor
  );
}

export async function reverseJournalEntry(
  journalId: string,
  actor: { id: string; name: string; role: Role },
  reason: string
) {
  const original = await prisma.journalEntry.findUnique({
    where: { id: journalId },
    include: { lines: { orderBy: { sortOrder: "asc" } } }
  });

  if (!original) throw new Error("Jurnal tidak ditemukan.");
  if (original.status === "REVERSED" || original.reversedByJournalId) {
    throw new Error(`Jurnal ${original.journalNumber} sudah pernah dibalik (reversed).`);
  }
  if (original.isReversal) {
    throw new Error("Jurnal pembalik (reversal) tidak dapat dibalik kembali.");
  }

  const currentDate = new Date();
  await assertPeriodOpen(currentDate);

  return prisma.$transaction(async (tx) => {
    const reversalNumber = await generateNextJournalNumber(currentDate, "REV");

    // Invert debit and credit for each line
    const reversedLines = original.lines.map((line, idx) => ({
      accountId: line.accountId,
      accountCodeSnapshot: line.accountCodeSnapshot,
      accountNameSnapshot: line.accountNameSnapshot,
      debit: Number(line.credit),
      credit: Number(line.debit),
      memo: `Pembalik: ${line.memo || original.description}`,
      sortOrder: idx
    }));

    const reversalJournal = await tx.journalEntry.create({
      data: {
        journalNumber: reversalNumber,
        entryDate: currentDate,
        sourceType: original.sourceType,
        sourceId: `${original.sourceId || ""}-${original.postingType}-REV`,
        postingType: "REVERSAL",
        tipeId: original.tipeId,
        tipeCodeSnapshot: original.tipeCodeSnapshot,
        description: `Reversal untuk jurnal ${original.journalNumber}: ${reason}`,
        status: "POSTED",
        totalDebit: original.totalCredit,
        totalCredit: original.totalDebit,
        isReversal: true,
        reversalOfJournalId: original.id,
        reversalReason: reason,
        createdByUserId: actor.id,
        createdByNameSnapshot: actor.name,
        lines: {
          create: reversedLines
        }
      },
      include: { lines: true }
    });

    await tx.journalEntry.update({
      where: { id: original.id },
      data: {
        status: "REVERSED",
        reversedByJournalId: reversalJournal.id,
        reversalReason: reason
      }
    });

    await tx.auditLog.create({
      data: {
        id: crypto.randomUUID(),
        entityType: "coa",
        entityId: reversalJournal.id,
        action: "create",
        afterValue: JSON.parse(JSON.stringify(reversalJournal)),
        userId: actor.id,
        userNameSnapshot: actor.name,
        userRoleSnapshot: actor.role,
        reason: `Reversal jurnal ${original.journalNumber} dengan ${reversalJournal.journalNumber}. Alasan: ${reason}`
      }
    });

    return reversalJournal;
  });
}

export type JournalEntryRow = Awaited<ReturnType<typeof listJournalEntries>>["entries"][number];

export async function listJournalEntries(filters: {
  keyword?: string;
  startDate?: string;
  endDate?: string;
  sourceType?: string;
  status?: JournalStatus;
  tipeId?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const where: Prisma.JournalEntryWhereInput = {};

  if (filters.status) where.status = filters.status;
  if (filters.sourceType) where.sourceType = filters.sourceType;
  if (filters.tipeId) where.tipeId = filters.tipeId;

  if (filters.startDate || filters.endDate) {
    where.entryDate = {};
    if (filters.startDate) where.entryDate.gte = new Date(filters.startDate);
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      where.entryDate.lte = end;
    }
  }

  if (filters.keyword?.trim()) {
    const q = filters.keyword.trim();
    where.OR = [
      { journalNumber: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { createdByNameSnapshot: { contains: q, mode: "insensitive" } },
      { lines: { some: { accountNameSnapshot: { contains: q, mode: "insensitive" } } } },
      { lines: { some: { memo: { contains: q, mode: "insensitive" } } } }
    ];
  }

  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.max(1, Math.min(100, filters.pageSize || 25));
  const skip = (page - 1) * pageSize;

  const [total, entries] = await Promise.all([
    prisma.journalEntry.count({ where }),
    prisma.journalEntry.findMany({
      where,
      include: {
        lines: {
          include: { account: true },
          orderBy: { sortOrder: "asc" }
        }
      },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize
    })
  ]);

  return {
    entries,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  };
}

export async function getJournalEntry(id: string) {
  return prisma.journalEntry.findUnique({
    where: { id },
    include: {
      lines: {
        include: { account: true },
        orderBy: { sortOrder: "asc" }
      }
    }
  });
}
