import type { LandedCostType, LandedCostAllocationMethod } from "@prisma/client";

export interface LandedCostInputItem {
  id: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPriceOriginal: number;
}

export interface LandedCostCalculationFee {
  id?: string;
  costType: LandedCostType;
  isCreditableTax: boolean;
  amountIdr: number;
  allocationMethod: LandedCostAllocationMethod;
  description?: string;
}

export interface ItemCostAllocationResult {
  itemId: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPriceOriginal: number;
  itemBaseIdr: number;
  allocatedLandedCostIdr: number;
  totalCostIdr: number;
  finalUnitCostIdr: number;
}

export interface LandedCostSummaryResult {
  items: ItemCostAllocationResult[];
  totalGoodsValas: number;
  totalGoodsIdr: number;
  totalNonCreditableLandedIdr: number;
  totalCreditableTaxIdr: number;
  grandTotalInventoryIdr: number;
}

export function allocateLandedCost(
  items: LandedCostInputItem[],
  landedCosts: LandedCostCalculationFee[],
  exchangeRate: number
): LandedCostSummaryResult {
  const totalGoodsValas = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceOriginal,
    0
  );
  const totalGoodsIdr = Math.round(totalGoodsValas * exchangeRate);

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  let totalNonCreditableLandedIdr = 0;
  let totalCreditableTaxIdr = 0;

  for (const fee of landedCosts) {
    if (fee.isCreditableTax) {
      totalCreditableTaxIdr += fee.amountIdr;
    } else {
      totalNonCreditableLandedIdr += fee.amountIdr;
    }
  }

  // Calculate allocation per item
  const allocatedByItem: Record<string, number> = {};
  for (const item of items) {
    allocatedByItem[item.id] = 0;
  }

  for (const fee of landedCosts) {
    // Creditable tax (PPN Impor / PPh 22) is NOT allocated into inventory HPP
    if (fee.isCreditableTax) continue;

    for (const item of items) {
      const itemBaseValas = item.quantity * item.unitPriceOriginal;
      let ratio = 0;

      if (fee.allocationMethod === "BY_QUANTITY") {
        ratio = totalQuantity > 0 ? item.quantity / totalQuantity : 0;
      } else {
        // BY_VALUE default
        ratio = totalGoodsValas > 0 ? itemBaseValas / totalGoodsValas : 0;
      }

      allocatedByItem[item.id] += fee.amountIdr * ratio;
    }
  }

  const results: ItemCostAllocationResult[] = items.map((item) => {
    const itemBaseValas = item.quantity * item.unitPriceOriginal;
    const itemBaseIdr = Math.round(itemBaseValas * exchangeRate);
    const allocatedLandedCostIdr = Math.round(allocatedByItem[item.id] || 0);
    const totalCostIdr = itemBaseIdr + allocatedLandedCostIdr;
    const finalUnitCostIdr =
      item.quantity > 0 ? Math.round((totalCostIdr / item.quantity) * 100) / 100 : 0;

    return {
      itemId: item.id,
      itemCode: item.itemCode,
      itemName: item.itemName,
      quantity: item.quantity,
      unitPriceOriginal: item.unitPriceOriginal,
      itemBaseIdr,
      allocatedLandedCostIdr,
      totalCostIdr,
      finalUnitCostIdr
    };
  });

  return {
    items: results,
    totalGoodsValas,
    totalGoodsIdr,
    totalNonCreditableLandedIdr,
    totalCreditableTaxIdr,
    grandTotalInventoryIdr: totalGoodsIdr + totalNonCreditableLandedIdr
  };
}
