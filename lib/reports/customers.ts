import "server-only";
import { listSalesRecords } from "@/lib/sales/store";
import { listTempoReceivables } from "@/lib/tempo/store";
import type { Sale } from "@/lib/types/sales";

export type CustomerSalesRow = {
  customerKey: string;
  customerName: string;
  locations: string[];
  primaryLocation: string;
  totalOrders: number;
  totalRevenue: number;
  totalQuantity: number;
  averageOrderValue: number;
  firstOrderDate: string;
  lastOrderDate: string;
  hasOpenTempo: boolean;
  openTempoBalance: number;
};

export type CustomerReportSummary = {
  totalCustomers: number;
  totalRevenue: number;
  totalOrders: number;
  averageRevenuePerCustomer: number;
  topSpender?: { name: string; revenue: number };
  mostFrequent?: { name: string; orders: number };
};

export type CustomerSortBy = "omset" | "orders" | "qty" | "name";
export type CustomerSortOrder = "asc" | "desc";

export type CustomerReportOptions = {
  startDate?: string;
  endDate?: string;
  keyword?: string;
  tipe?: string;
  sortBy?: CustomerSortBy;
  sortOrder?: CustomerSortOrder;
  page?: number;
  pageSize?: number;
};

export type CustomerReportResult = {
  data: CustomerSalesRow[];
  summary: CustomerReportSummary;
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

function normalizeCustomerKey(name?: string | null): string {
  return (name || "Anonim").trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanString(val?: string | null): string {
  return (val || "").trim();
}

export async function getCustomerSalesReport(
  options: CustomerReportOptions = {}
): Promise<CustomerReportResult> {
  const [sales, allTempo] = await Promise.all([
    listSalesRecords(),
    listTempoReceivables().catch(() => [])
  ]);

  // Map open tempo balance by normalized customer key
  const openTempoMap = new Map<string, number>();
  for (const t of allTempo) {
    if (["paid", "cancelled", "written_off"].includes(t.status)) continue;
    const key = normalizeCustomerKey(t.customerName);
    const balance = Number(t.remainingAmount) || 0;
    openTempoMap.set(key, (openTempoMap.get(key) || 0) + balance);
  }

  // Filter valid sales
  const validSales = sales.filter((s: Sale) => {
    if (s.approvalStatus !== "approved") return false;
    if (s.isTestTransaction) return false;
    if (options.startDate && s.saleDate < options.startDate) return false;
    if (options.endDate && s.saleDate > options.endDate) return false;
    if (options.tipe && (s.tipeCodeSnapshot || s.tipeId || "") !== options.tipe) return false;
    return true;
  });

  // Group by normalized customer name
  const grouped = new Map<
    string,
    {
      key: string;
      displayNames: Map<string, number>; // name variant -> count
      locations: Set<string>;
      orders: number;
      revenue: number;
      quantity: number;
      dates: string[];
    }
  >();

  for (const s of validSales) {
    const rawName = cleanString(s.customerName) || "Walk In";
    const key = normalizeCustomerKey(rawName);

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        displayNames: new Map(),
        locations: new Set(),
        orders: 0,
        revenue: 0,
        quantity: 0,
        dates: []
      });
    }

    const entry = grouped.get(key)!;
    entry.displayNames.set(rawName, (entry.displayNames.get(rawName) || 0) + 1);
    if (s.customerLocation && cleanString(s.customerLocation)) {
      entry.locations.add(cleanString(s.customerLocation));
    }
    entry.orders += 1;
    entry.revenue += Number(s.total) || 0;

    const itemsQty = (s.items || []).reduce(
      (acc, item) => acc + (Number(item.quantity) || 0),
      0
    );
    entry.quantity += itemsQty;
    if (s.saleDate) entry.dates.push(s.saleDate);
  }

  // Convert to customer rows
  let rows: CustomerSalesRow[] = Array.from(grouped.values()).map((entry) => {
    // Pick the most frequent or latest display name
    let bestName = entry.key;
    let maxCount = -1;
    entry.displayNames.forEach((count, name) => {
      if (count > maxCount) {
        maxCount = count;
        bestName = name;
      }
    });

    const sortedDates = entry.dates.sort();
    const firstOrderDate = sortedDates[0] || "-";
    const lastOrderDate = sortedDates[sortedDates.length - 1] || "-";
    const locations = Array.from(entry.locations);
    const primaryLocation = locations[0] || "-";
    const tempoBalance = openTempoMap.get(entry.key) || 0;

    return {
      customerKey: entry.key,
      customerName: bestName,
      locations,
      primaryLocation,
      totalOrders: entry.orders,
      totalRevenue: entry.revenue,
      totalQuantity: entry.quantity,
      averageOrderValue: entry.orders > 0 ? Math.round(entry.revenue / entry.orders) : 0,
      firstOrderDate,
      lastOrderDate,
      hasOpenTempo: tempoBalance > 0,
      openTempoBalance: tempoBalance
    };
  });

  // Filter keyword if specified
  const keyword = cleanString(options.keyword).toLowerCase();
  if (keyword) {
    rows = rows.filter(
      (r) =>
        r.customerName.toLowerCase().includes(keyword) ||
        r.locations.some((loc) => loc.toLowerCase().includes(keyword))
    );
  }

  // Calculate summary metrics before pagination
  const totalCustomers = rows.length;
  const totalRevenue = rows.reduce((acc, r) => acc + r.totalRevenue, 0);
  const totalOrders = rows.reduce((acc, r) => acc + r.totalOrders, 0);
  const averageRevenuePerCustomer =
    totalCustomers > 0 ? Math.round(totalRevenue / totalCustomers) : 0;

  let topSpender: { name: string; revenue: number } | undefined;
  let mostFrequent: { name: string; orders: number } | undefined;

  if (rows.length > 0) {
    const sortedByRev = [...rows].sort((a, b) => b.totalRevenue - a.totalRevenue);
    topSpender = {
      name: sortedByRev[0].customerName,
      revenue: sortedByRev[0].totalRevenue
    };

    const sortedByOrders = [...rows].sort((a, b) => b.totalOrders - a.totalOrders);
    mostFrequent = {
      name: sortedByOrders[0].customerName,
      orders: sortedByOrders[0].totalOrders
    };
  }

  // Sorting
  const sortBy = options.sortBy || "omset";
  const sortOrder = options.sortOrder || "desc";

  rows.sort((a, b) => {
    let comparison = 0;
    if (sortBy === "omset") {
      comparison = a.totalRevenue - b.totalRevenue;
    } else if (sortBy === "orders") {
      comparison = a.totalOrders - b.totalOrders;
    } else if (sortBy === "qty") {
      comparison = a.totalQuantity - b.totalQuantity;
    } else if (sortBy === "name") {
      comparison = a.customerName.localeCompare(b.customerName);
    }

    return sortOrder === "desc" ? -comparison : comparison;
  });

  // Pagination
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.min(Math.max(1, options.pageSize || 25), 100);
  const totalPages = Math.max(1, Math.ceil(totalCustomers / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pagedRows = rows.slice(startIndex, startIndex + pageSize);

  return {
    data: pagedRows,
    summary: {
      totalCustomers,
      totalRevenue,
      totalOrders,
      averageRevenuePerCustomer,
      topSpender,
      mostFrequent
    },
    meta: {
      page: safePage,
      pageSize,
      total: totalCustomers,
      totalPages
    }
  };
}
