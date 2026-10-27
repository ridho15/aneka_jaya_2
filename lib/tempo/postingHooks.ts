import "server-only";
import { prisma } from "@/lib/db/prisma";
import { postJournalEntry, reverseJournalEntry, type JournalLineInput } from "@/lib/accounting/journalStore";
import { getAccountByCode, ensureStandardAccounts } from "@/lib/accounting/accountStore";
import { assertPeriodOpen } from "@/lib/accounting/periodStore";
import type { Role } from "@/lib/auth/roles";
import type { TempoPayment } from "@/lib/tempo/store";

export interface TempoPostingActor {
  id: string;
  name: string;
  role: Role;
}

/**
 * Otomatis mem-posting jurnal saat pembayaran / cicilan piutang tempo dicatat (TempoPayment).
 * Aturan Akuntansi:
 * - Debit Kas & Bank (1-1001 / Rekening COA)
 * - Kredit Piutang Usaha (1-1004)
 */
export async function postTempoPaymentJournal(
  payment: TempoPayment,
  actor?: TempoPostingActor
) {
  await ensureStandardAccounts();
  await assertPeriodOpen(payment.paymentDate);

  const effectiveActor: TempoPostingActor = actor || {
    id: payment.createdByUserId,
    name: payment.createdByNameSnapshot,
    role: "FINANCE"
  };

  const amountPaid = Number(payment.amountPaid) || 0;
  if (amountPaid <= 0) return null;

  // Resolve COA Accounts
  const receivableAccount = await getAccountByCode("1-1004");
  if (!receivableAccount) throw new Error("Akun Piutang Usaha (1-1004) tidak ditemukan.");

  const defaultCashAccount = await getAccountByCode("1-1001");
  if (!defaultCashAccount) throw new Error("Akun Kas & Bank (1-1001) tidak ditemukan.");

  let bankAccount = defaultCashAccount;
  if (payment.rekeningId) {
    const rek = await prisma.rekeningAccount.findUnique({
      where: { id: payment.rekeningId },
      include: { account: true }
    });
    if (rek?.account) bankAccount = rek.account;
  }

  const lines: JournalLineInput[] = [
    {
      accountId: bankAccount.id,
      accountCodeSnapshot: bankAccount.code,
      accountNameSnapshot: bankAccount.name,
      debit: amountPaid,
      credit: 0,
      memo: `Pelunasan Piutang Tempo via ${payment.rekeningNameSnapshot || bankAccount.name}`
    },
    {
      accountId: receivableAccount.id,
      accountCodeSnapshot: receivableAccount.code,
      accountNameSnapshot: receivableAccount.name,
      debit: 0,
      credit: amountPaid,
      memo: `Penerimaan Pelunasan Piutang Usaha (ID ${payment.tempoReceivableId})`
    }
  ];

  const journal = await postJournalEntry(
    {
      entryDate: payment.paymentDate,
      sourceType: "TEMPO_PAYMENT",
      sourceId: payment.id,
      postingType: "REPAYMENT",
      description: `Pelunasan Piutang Tempo (Rp ${amountPaid.toLocaleString("id-ID")}) via ${payment.rekeningNameSnapshot || "Kas/Bank"}`,
      lines
    },
    effectiveActor
  );

  return journal;
}

/**
 * Otomatis mem-posting jurnal pembalik saat pembayaran tempo dibatalkan / direverse.
 */
export async function reverseTempoPaymentJournal(
  tempoPaymentId: string,
  actor: TempoPostingActor,
  reason: string
) {
  const originalJournal = await prisma.journalEntry.findFirst({
    where: {
      sourceType: "TEMPO_PAYMENT",
      sourceId: tempoPaymentId,
      postingType: "REPAYMENT",
      status: "POSTED"
    }
  });

  if (!originalJournal) return null;

  return reverseJournalEntry(originalJournal.id, actor, reason);
}
