import { prisma } from "@/lib/db/prisma";
import type { PenjualanInput } from "@/lib/validation/penjualanSchema";
import type { Sale } from "@/lib/types/sales";
import { listSalesRecords } from "@/lib/sales/store";

// Map to track in-flight requests by clientRequestId with expiration timestamp
const inFlightRequests = new Map<string, number>();
const LOCK_TIMEOUT_MS = 60_000; // 60 seconds auto-expire for stale in-flight locks

/**
 * Acquire in-flight lock for a clientRequestId.
 * Returns true if lock was acquired, false if request is currently in-flight.
 */
export function acquireSalesLock(clientRequestId?: string): boolean {
  if (!clientRequestId) return true;

  const now = Date.now();
  const existingTime = inFlightRequests.get(clientRequestId);

  if (existingTime && now - existingTime < LOCK_TIMEOUT_MS) {
    return false; // Lock busy, request in-flight
  }

  inFlightRequests.set(clientRequestId, now);
  return true;
}

/**
 * Release in-flight lock for a clientRequestId.
 */
export function releaseSalesLock(clientRequestId?: string): void {
  if (!clientRequestId) return;
  inFlightRequests.delete(clientRequestId);
}

/**
 * Check if a transaction with the same clientRequestId has already been created.
 * (Layer 2: Technical Idempotency)
 */
export async function findExistingSaleByRequestId(clientRequestId?: string): Promise<Sale | undefined> {
  if (!clientRequestId) return undefined;

  try {
    if (prisma?.salesRecord) {
      const row = await prisma.salesRecord.findFirst({
        where: { externalReference: clientRequestId },
        include: { items: true }
      });
      if (row) {
        const sales = await listSalesRecords();
        return sales.find((s) => s.id === row.id) || (row as unknown as Sale);
      }
    }
  } catch (error) {
    console.error("[deduplication] Failed to lookup existing sale by externalReference:", error);
  }

  // Fallback to local store
  try {
    const sales = await listSalesRecords();
    return sales.find((s) => s.externalReference === clientRequestId);
  } catch {
    return undefined;
  }
}

/**
 * Compare two item lists to check if they have identical products and quantities.
 */
function areItemsIdentical(
  inputItems: PenjualanInput["items"],
  existingItems: Sale["items"]
): boolean {
  if (inputItems.length !== existingItems.length) return false;

  const sortedInput = [...inputItems].sort((a, b) => a.productRef.localeCompare(b.productRef));
  const sortedExisting = [...existingItems].sort((a, b) => a.productRef.localeCompare(b.productRef));

  for (let i = 0; i < sortedInput.length; i++) {
    const itemIn = sortedInput[i];
    const itemEx = sortedExisting[i];

    if (itemIn.productRef.trim().toLowerCase() !== itemEx.productRef.trim().toLowerCase()) {
      return false;
    }
    if (Number(itemIn.quantity) !== Number(itemEx.quantity)) {
      return false;
    }
    if (Number(itemIn.unitPrice) !== Number(itemEx.unitPrice)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a duplicate transaction was created recently (default: within 15 minutes).
 * (Layer 3: Semantic Content Deduplication)
 */
export async function findSemanticDuplicateSale(
  input: PenjualanInput,
  windowMinutes = 15
): Promise<Sale | undefined> {
  // Drafts or explicit overrides bypass semantic duplicate checks
  if (input.isDraft || input.allowDuplicate) return undefined;

  const inputTotal = input.items.reduce(
    (sum, item) => sum + (item.quantity * item.unitPrice - (item.discount || 0)),
    0
  );
  const normalizedCustomer = (input.customerName || "").trim().toLowerCase();
  const now = Date.now();
  const cutoffTime = now - windowMinutes * 60 * 1000;

  try {
    const allSales = await listSalesRecords();

    // Look for active sales within cutoff time window
    const candidates = allSales.filter((sale) => {
      // Must not be draft or cancelled
      if (sale.approvalStatus === "draft" || sale.approvalStatus === "cancelled") return false;

      // Must be created within the time window
      const saleCreatedAt = new Date(sale.createdAt || 0).getTime();
      if (isNaN(saleCreatedAt) || saleCreatedAt < cutoffTime) return false;

      // Customer name match (case-insensitive)
      const saleCustomer = (sale.customerName || "").trim().toLowerCase();
      if (saleCustomer !== normalizedCustomer) return false;

      // Total amount match
      if (Math.abs(Number(sale.total) - inputTotal) > 0.01) return false;

      // Payment method match
      if (sale.paymentMethod !== input.paymentMethod) return false;

      return true;
    });

    for (const candidate of candidates) {
      if (candidate.items && areItemsIdentical(input.items, candidate.items)) {
        return candidate;
      }
    }

    return undefined;
  } catch (error) {
    console.error("[deduplication] Error during semantic duplicate check:", error);
    return undefined;
  }
}
