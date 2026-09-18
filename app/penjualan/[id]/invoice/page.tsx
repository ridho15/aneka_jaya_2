import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getSalesRecordForUser } from "@/lib/sales/access";
import { listAllRekeningAccounts } from "@/lib/business/masterData";
import {
  formatJakartaDate,
  formatJakartaDateTimeCompact,
} from "@/lib/date/jakarta";
import {
  TransactionInvoiceView,
  type InvoiceCustomer,
  type InvoicePayment,
} from "@/components/invoice/TransactionInvoiceView";
import type { Sale } from "@/lib/types/sales";

export const dynamic = "force-dynamic";

function resolveCustomer(sale: Sale): InvoiceCustomer {
  const name = sale.customerName || "Walk In";
  let city = "";
  let phone = sale.customerPhone || "";
  let address = "";

  const location = (sale.customerLocation || "").trim();
  const notes = (sale.notes || "").trim();

  // If no dedicated phone, try to extract from location or notes
  if (!phone) {
    const combined = `${location} ${notes}`;
    const phoneMatch = combined.match(
      /(?:Telp:?|WA:?|HP:?|No\.?:?)?\s*(08\d{8,12}|\+62\d{9,13})/i,
    );
    if (phoneMatch) {
      phone = phoneMatch[1];
    }
  }

  if (location && location !== "Toko") {
    const parts = location.split(",").map((s) => s.trim());
    if (parts.length > 1) {
      city = parts[0];
      address = location;
    } else {
      city = location;
      address = location;
    }
  }

  if (notes) {
    if (!address || address === "Toko") {
      address = notes;
    } else if (notes !== address && !notes.includes(phone)) {
      address = `${address}, ${notes}`;
    }
  }

  return {
    name,
    city: city || undefined,
    phone: phone || undefined,
    address: address || undefined,
    shippingMethod: sale.shippingMethod || undefined,
    trackingNumber: sale.doTrackingNumber || undefined,
  };
}

export default async function SalesInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const user = await getCurrentUser();
  const role = user.role;
  if (!can(role, "penjualan.create") && !can(role, "reports.view") && !can(role, "penjualan.manage")) {
    redirect("/");
  }

  const { id } = await params;
  const { created } = await searchParams;
  const sale = await getSalesRecordForUser(id, user);

  if (!sale) {
    notFound();
  }

  const accounts = await listAllRekeningAccounts();
  const matchedRekening = accounts.find((r) => r.id === sale.rekeningId);

  // Resolve transaction number formatted as INV-...
  let invoiceNumber =
    sale.erpInvoiceNumber ||
    (sale.transactionNumber?.startsWith("INV-")
      ? sale.transactionNumber
      : sale.transactionNumber
        ? `INV-${sale.transactionNumber}`
        : sale.erpReference?.startsWith("INV-")
          ? sale.erpReference
          : `INV-${sale.id.slice(0, 8).toUpperCase()}`);

  const customer = resolveCustomer(sale);

  // Resolve payment details
  const isCash =
    sale.paymentMethod === "Cash" ||
    sale.paymentMethod === "Other" ||
    sale.rekeningNameSnapshot?.toLowerCase().includes("kas");

  const payment: InvoicePayment = {
    method: sale.paymentMethod,
    bankName: isCash
      ? "Kas Walk In / Tunai"
      : matchedRekening?.bank && matchedRekening.bank !== "Cash"
        ? matchedRekening.bank
        : "Maybank",
    accountNumber: isCash
      ? undefined
      : matchedRekening?.accountNumber && matchedRekening.accountNumber !== "-"
        ? matchedRekening.accountNumber
        : "8167960828",
    accountHolder: isCash
      ? undefined
      : matchedRekening?.name && !matchedRekening.name.toLowerCase().includes("kas")
        ? matchedRekening.name
        : "Tsani Salim",
    notes:
      sale.paymentMethod === "Tempo" && sale.dueDate
        ? `Jatuh tempo: ${formatJakartaDate(sale.dueDate)}`
        : undefined,
  };

  const invoiceItems = sale.items.map((item, index) => {
    const qty = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const discount = Number(item.discount || 0);
    const total = Math.max(0, qty * unitPrice - discount);

    return {
      index: index + 1,
      name: item.manualProduct?.name || item.productRef,
      code: item.manualProduct?.sku || item.productRef,
      quantity: qty,
      unit: item.unitSnapshot || "Pack",
      unitPrice,
      total,
    };
  });

  const formattedDate = formatJakartaDate(sale.transactionAt || sale.saleDate);
  const formattedDateTime = formatJakartaDateTimeCompact(
    sale.transactionAt || sale.saleDate,
  );
  const formattedDueDate = sale.dueDate
    ? (/^\d{2}\/\d{2}\/\d{4}$/.test(sale.dueDate.trim())
        ? sale.dueDate.trim()
        : formatJakartaDate(sale.dueDate))
    : undefined;

  const discountTotal = sale.items.reduce(
    (sum, item) => sum + Number(item.discount || 0),
    0,
  );
  const subtotalGross = sale.items.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
    0,
  );

  return (
    <TransactionInvoiceView
      kind="sales"
      id={sale.id}
      transactionNumber={invoiceNumber}
      date={formattedDate}
      dateTime={formattedDateTime}
      dueDate={formattedDueDate}
      isTempo={sale.paymentMethod === "Tempo"}
      customer={customer}
      items={invoiceItems}
      totalAmount={Number(sale.total || 0)}
      payment={payment}
      isNewlyCreated={created === "1"}
      approvalStatus={sale.approvalStatus}
      cashierName={sale.createdByNameSnapshot || "Kasir Toko"}
      tipeLabel={sale.tipeNameSnapshot || sale.tipeCodeSnapshot}
      subtotalAmount={subtotalGross}
      discountAmount={discountTotal}
    />
  );
}
