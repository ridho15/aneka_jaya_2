import { prisma } from "@/lib/db/prisma";
import { jakartaDateKey } from "@/lib/date/jakarta";

export type ProductReportFilter = {
  startDate: string;
  endDate: string;
  productKeyword?: string;
  productId?: string;
  sku?: string;
  category?: string;
};

export type ProductSalesItemSummary = {
  productRef: string;
  code: string;
  name: string;
  totalQuantity: number;
  unit: string;
  totalOmset: number;
  transactionCount: number;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
};

export type ProductTransactionDetail = {
  id: string;
  saleDate: string;
  transactionNumber?: string;
  customerName: string;
  paymentMethod: string;
  productRef: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
  unit: string;
};

export type ProductReportResult = {
  items: ProductSalesItemSummary[];
  transactions: ProductTransactionDetail[];
  summary: {
    totalOmset: number;
    totalQuantity: number;
    uniqueProductsCount: number;
    totalTransactionsCount: number;
    topProduct?: ProductSalesItemSummary;
  };
  filter: ProductReportFilter;
  generatedAt: string;
};

function parseProductRef(productRef: string) {
  const parts = productRef.trim().split(/\s+/);
  const code = parts[0] || productRef;
  const name = parts.slice(1).join(" ") || code;
  return { code, name };
}

export async function getProductSalesReport(
  filter: ProductReportFilter,
): Promise<ProductReportResult> {
  const start = new Date(`${filter.startDate}T00:00:00.000`);
  const end = new Date(`${filter.endDate}T23:59:59.999`);

  const sales = await prisma.salesRecord.findMany({
    where: {
      saleDate: {
        gte: start,
        lte: end,
      },
      isTestTransaction: false,
      approvalStatus: {
        notIn: ["cancelled", "rejected"],
      },
    },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: {
      saleDate: "desc",
    },
  });

  const itemMap = new Map<
    string,
    {
      productRef: string;
      code: string;
      name: string;
      totalQuantity: number;
      unit: string;
      totalOmset: number;
      prices: number[];
      transactionIds: Set<string>;
    }
  >();

  const transactions: ProductTransactionDetail[] = [];
  const keyword = filter.productKeyword?.trim().toLowerCase() || "";
  const filterSku = filter.sku?.trim().toLowerCase() || "";

  for (const sale of sales) {
    const saleDateStr = jakartaDateKey(sale.saleDate);

    for (const item of sale.items) {
      const { code, name } = parseProductRef(item.productRef);
      const productRefLower = item.productRef.toLowerCase();

      // Apply product keyword/sku filter if specified
      if (keyword && !productRefLower.includes(keyword)) {
        continue;
      }
      if (filterSku && !code.toLowerCase().includes(filterSku)) {
        continue;
      }

      const qty = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const discount = Number(item.discount || 0);
      const subtotal = qty * unitPrice - discount;
      const unit = item.unitSnapshot || "Pcs";

      // Add to transaction details
      transactions.push({
        id: `${sale.id}-${item.id}`,
        saleDate: saleDateStr,
        transactionNumber: sale.transactionNumber || sale.id,
        customerName: sale.customerName,
        paymentMethod: sale.paymentMethod,
        productRef: item.productRef,
        quantity: qty,
        unitPrice,
        discount,
        subtotal,
        unit,
      });

      // Aggregate into itemMap
      const key = item.productRef.trim();
      const existing = itemMap.get(key);
      if (existing) {
        existing.totalQuantity += qty;
        existing.totalOmset += subtotal;
        existing.prices.push(unitPrice);
        existing.transactionIds.add(sale.id);
        if (!existing.unit && unit) existing.unit = unit;
      } else {
        itemMap.set(key, {
          productRef: item.productRef,
          code,
          name,
          totalQuantity: qty,
          unit,
          totalOmset: subtotal,
          prices: [unitPrice],
          transactionIds: new Set([sale.id]),
        });
      }
    }
  }

  const items: ProductSalesItemSummary[] = Array.from(itemMap.values())
    .map((entry) => {
      const minPrice = Math.min(...entry.prices);
      const maxPrice = Math.max(...entry.prices);
      const avgPrice =
        entry.totalQuantity > 0
          ? Math.round(entry.totalOmset / entry.totalQuantity)
          : 0;

      return {
        productRef: entry.productRef,
        code: entry.code,
        name: entry.name,
        totalQuantity: entry.totalQuantity,
        unit: entry.unit,
        totalOmset: entry.totalOmset,
        transactionCount: entry.transactionIds.size,
        minPrice,
        maxPrice,
        avgPrice,
      };
    })
    .sort((a, b) => b.totalOmset - a.totalOmset); // Urutkan omset tertinggi pertama

  const totalOmset = items.reduce((sum, item) => sum + item.totalOmset, 0);
  const totalQuantity = items.reduce((sum, item) => sum + item.totalQuantity, 0);
  const uniqueTransactions = new Set(transactions.map((t) => t.id)).size;

  return {
    items,
    transactions,
    summary: {
      totalOmset,
      totalQuantity,
      uniqueProductsCount: items.length,
      totalTransactionsCount: uniqueTransactions,
      topProduct: items[0] || undefined,
    },
    filter,
    generatedAt: new Date().toISOString(),
  };
}
