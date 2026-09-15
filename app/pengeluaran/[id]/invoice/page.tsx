import { notFound, redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getExpenseRecord } from "@/lib/expenses/store";
import { formatJakartaDate } from "@/lib/date/jakarta";
import {
  TransactionInvoiceView,
  type InvoicePayment,
} from "@/components/invoice/TransactionInvoiceView";

export const dynamic = "force-dynamic";

export default async function ExpenseInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const role = await getCurrentRole();
  if (
    !can(role, "pengeluaran.view") &&
    !can(role, "pengeluaran.create") &&
    !can(role, "pengeluaran.manage")
  ) {
    redirect("/");
  }

  const { id } = await params;
  const { created } = await searchParams;
  const expense = await getExpenseRecord(id);

  if (!expense) {
    notFound();
  }

  const voucherNumber =
    expense.erpReference ||
    (expense.id.startsWith("EXP-")
      ? expense.id
      : `EXP-${expense.id.slice(0, 8).toUpperCase()}`);

  const formattedDate = formatJakartaDate(expense.expenseDate);

  const payment: InvoicePayment = {
    method: expense.paymentMethod || "Cash",
    bankName: expense.rekeningNameSnapshot || "Kas",
    notes: expense.notes,
  };

  const items = [
    {
      index: 1,
      name: expense.description || "Pengeluaran Operasional",
      code: expense.category,
      category: expense.category,
      coa: expense.coaNameSnapshot || "Kas",
      quantity: 1,
      unit: "Transaksi",
      unitPrice: Number(expense.amount || 0),
      total: Number(expense.amount || 0),
    },
  ];

  return (
    <TransactionInvoiceView
      kind="expenses"
      id={expense.id}
      transactionNumber={voucherNumber}
      date={formattedDate}
      vendor={{
        name: expense.vendorName || "Penerima / Vendor",
        category: expense.category,
        description: expense.description,
        notes: expense.notes,
      }}
      items={items}
      totalAmount={Number(expense.amount || 0)}
      payment={payment}
      isNewlyCreated={created === "1"}
      approvalStatus={expense.approvalStatus}
      cashierName={expense.createdByNameSnapshot || "Petugas Kasir"}
      tipeLabel={expense.tipeNameSnapshot || expense.tipeCodeSnapshot}
    />
  );
}
