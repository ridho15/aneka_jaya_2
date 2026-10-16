import "server-only";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db/prisma";
import { getCctvSystemStatus } from "@/lib/cctv/client";

export function sanitizeCctvEvidenceUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // 1. Jika URL lokal /uploads/
  if (trimmed.startsWith("/uploads/")) {
    const fullPath = join(process.cwd(), "public", trimmed);
    if (!existsSync(fullPath)) {
      return null;
    }
    return trimmed;
  }

  // 2. Jika URL sudah mengarah ke proxy internal Next.js
  if (trimmed.startsWith("/api/cctv/evidence")) {
    return trimmed;
  }

  // 3. Jika URL adalah URL internal VPS atau localhost (misal http://localhost:8000/..., http://127.0.0.1:8000/..., http://31.97.51.194:8000/...)
  // atau path relatif seperti /labels/34
  if (
    trimmed.includes("localhost:8000") ||
    trimmed.includes("127.0.0.1:8000") ||
    trimmed.includes("31.97.51.194:8000") ||
    trimmed.startsWith("/labels/") ||
    trimmed.startsWith("/api/v1/slm/evidence")
  ) {
    return `/api/cctv/evidence?url=${encodeURIComponent(trimmed)}`;
  }

  return trimmed;
}

export const sanitizeLocalPhotoUrl = sanitizeCctvEvidenceUrl;

export function parseDateFilterRange(from?: string, to?: string): { gte?: Date; lte?: Date } | null {
  if (!from && !to) return null;
  const range: { gte?: Date; lte?: Date } = {};
  if (from) {
    const fromDate = new Date(`${from}T00:00:00+07:00`);
    if (!isNaN(fromDate.getTime())) {
      range.gte = fromDate;
    }
  }
  if (to) {
    const toDate = new Date(`${to}T23:59:59+07:00`);
    if (!isNaN(toDate.getTime())) {
      range.lte = toDate;
    }
  }
  if (!range.gte && !range.lte) return null;
  return range;
}

export function getPackingDateCondition(range: { gte?: Date; lte?: Date }) {
  return {
    OR: [
      { packingCompletedAt: range },
      { packingCompletedAt: null, createdAt: range },
    ],
  };
}

export function getActivityDateCondition(range: { gte?: Date; lte?: Date }) {
  return {
    OR: [
      { packingCompletedAt: range },
      { firstSeenAt: range },
      { packingCompletedAt: null, firstSeenAt: null, createdAt: range },
    ],
  };
}

export interface ListCctvFilter {
  page?: number;
  pageSize?: number;
  search?: string;
  eventType?: string;
  cameraName?: string;
  matchStatus?: string;
  from?: string;
  to?: string;
}

export async function listCctvDetectionsPaginated(filter: ListCctvFilter) {
  const page = Math.max(1, Number(filter.page) || 1);
  const pageSize = Math.max(5, Math.min(100, Number(filter.pageSize) || 20));
  const skip = (page - 1) * pageSize;

  const where: any = {};

  if (filter.eventType && filter.eventType !== "all") {
    where.eventType = filter.eventType;
  }

  if (filter.matchStatus && filter.matchStatus !== "all") {
    where.matchStatus = filter.matchStatus;
  }

  if (filter.cameraName && filter.cameraName !== "all") {
    where.cameraName = { contains: filter.cameraName, mode: "insensitive" };
  }

  if (filter.search && filter.search.trim()) {
    const s = filter.search.trim();
    where.OR = [
      { invoiceNumber: { contains: s, mode: "insensitive" } },
      { customerName: { contains: s, mode: "insensitive" } },
      { cameraName: { contains: s, mode: "insensitive" } },
      { sourceLabel: { contains: s, mode: "insensitive" } },
      { notes: { contains: s, mode: "insensitive" } },
    ];
  }

  const dateRange = parseDateFilterRange(filter.from, filter.to);
  if (dateRange) {
    where.AND = [
      ...(where.AND || []),
      getActivityDateCondition(dateRange),
    ];
  }

  const [items, total] = await Promise.all([
    prisma.cctvDetectionLog.findMany({
      where,
      orderBy: [{ packingCompletedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
      include: {
        salesRecord: {
          select: {
            id: true,
            transactionNumber: true,
            customerName: true,
            total: true,
            doPackingStatus: true,
          },
        },
      },
    }),
    prisma.cctvDetectionLog.count({ where }),
  ]);

  const mappedItems = items.map((it) => ({
    ...it,
    screenshotPhotoUrl:
      sanitizeCctvEvidenceUrl(it.screenshotPhotoUrl) ||
      sanitizeCctvEvidenceUrl(it.evidenceUrl) ||
      (it.cctvLabelId ? `/api/cctv/evidence?labelId=${it.cctvLabelId}` : null),
    evidenceUrl:
      sanitizeCctvEvidenceUrl(it.evidenceUrl) ||
      sanitizeCctvEvidenceUrl(it.screenshotPhotoUrl) ||
      (it.cctvLabelId ? `/api/cctv/evidence?labelId=${it.cctvLabelId}` : null),
  }));

  return {
    items: mappedItems,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getCctvStats() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const todayRange = { gte: startOfDay, lte: endOfDay };
  const todayPackingCond = getPackingDateCondition(todayRange);
  const todayActivityCond = getActivityDateCondition(todayRange);

  const [totalToday, totalPackedToday, totalAnomaliesToday, byStoreRaw, byCameraRaw] =
    await Promise.all([
      prisma.cctvDetectionLog.count({
        where: todayActivityCond,
      }),
      prisma.cctvDetectionLog.count({
        where: {
          eventType: "packing_completed",
          ...todayPackingCond,
        },
      }),
      prisma.cctvDetectionLog.count({
        where: {
          eventType: "anomaly",
          ...todayActivityCond,
        },
      }),
      prisma.cctvDetectionLog.groupBy({
        by: ["sourceLabel"],
        where: {
          sourceLabel: { not: null },
          ...todayActivityCond,
        },
        _count: { id: true },
      }),
      prisma.cctvDetectionLog.groupBy({
        by: ["cameraName"],
        where: {
          cameraName: { not: null },
          ...todayActivityCond,
        },
        _count: { id: true },
      }),
    ]);

  const byStore: Record<string, number> = {};
  for (const s of byStoreRaw) {
    if (s.sourceLabel) byStore[s.sourceLabel] = s._count.id;
  }

  const byCamera: Record<string, number> = {};
  for (const c of byCameraRaw) {
    if (c.cameraName) byCamera[c.cameraName] = c._count.id;
  }

  // Coba ambil data kamera live dari CCTV VPS
  const liveSystem = await getCctvSystemStatus().catch(() => null);

  return {
    today: {
      totalDetections: totalToday,
      totalPacked: totalPackedToday,
      totalAnomalies: totalAnomaliesToday,
      byStore,
      byCamera,
    },
    liveSystem,
  };
}

export async function getCctvDetectionForSales(salesRecordId: string, invoiceNumber?: string) {
  if (!salesRecordId && !invoiceNumber) return null;

  return prisma.cctvDetectionLog.findFirst({
    where: {
      OR: [
        ...(salesRecordId ? [{ salesRecordId }] : []),
        ...(invoiceNumber ? [{ invoiceNumber }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
  });
}

export interface CctvOutboundReportFilter {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  cameraName?: string;
  sourceLabel?: string;
  search?: string;
}

export async function listCctvCameraNames(): Promise<string[]> {
  const groups = await prisma.cctvDetectionLog.groupBy({
    by: ["cameraName"],
    where: { cameraName: { not: null } },
  });
  return groups.map((g) => g.cameraName).filter((c): c is string => Boolean(c));
}

export async function getCctvOutboundReport(filter: CctvOutboundReportFilter) {
  const page = Math.max(1, Number(filter.page) || 1);
  const pageSize = Math.max(5, Math.min(100, Number(filter.pageSize) || 20));
  const skip = (page - 1) * pageSize;

  const where: any = {
    eventType: "packing_completed",
  };

  if (filter.cameraName && filter.cameraName !== "all") {
    where.cameraName = { contains: filter.cameraName, mode: "insensitive" };
  }

  if (filter.sourceLabel && filter.sourceLabel !== "all") {
    where.sourceLabel = { contains: filter.sourceLabel, mode: "insensitive" };
  }

  if (filter.search && filter.search.trim()) {
    const s = filter.search.trim();
    where.OR = [
      { invoiceNumber: { contains: s, mode: "insensitive" } },
      { customerName: { contains: s, mode: "insensitive" } },
      { notes: { contains: s, mode: "insensitive" } },
      {
        salesRecord: {
          OR: [
            { customerName: { contains: s, mode: "insensitive" } },
            { transactionNumber: { contains: s, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  const dateRange = parseDateFilterRange(filter.from, filter.to);
  if (dateRange) {
    where.AND = [
      ...(where.AND || []),
      getPackingDateCondition(dateRange),
    ];
  }

  const [items, total, allDetectedLogs] = await Promise.all([
    prisma.cctvDetectionLog.findMany({
      where,
      orderBy: [{ packingCompletedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
      include: {
        salesRecord: {
          select: {
            id: true,
            transactionNumber: true,
            customerName: true,
            customerLocation: true,
            shippingMethod: true,
            total: true,
            doPackingStatus: true,
            doShippingStatus: true,
            items: {
              select: {
                id: true,
                productRef: true,
                productId: true,
                manualProduct: true,
                quantity: true,
                unitSnapshot: true,
              },
            },
          },
        },
      },
    }),
    prisma.cctvDetectionLog.count({ where }),
    prisma.cctvDetectionLog.findMany({
      where,
      select: {
        id: true,
        cameraName: true,
        salesRecord: {
          select: {
            items: {
              select: {
                quantity: true,
              },
            },
          },
        },
      },
    }),
  ]);

  let totalSkusDispatched = 0;
  const cameraCounts: Record<string, number> = {};

  for (const log of allDetectedLogs) {
    if (log.cameraName) {
      cameraCounts[log.cameraName] = (cameraCounts[log.cameraName] || 0) + 1;
    }
    if (log.salesRecord?.items) {
      for (const it of log.salesRecord.items) {
        totalSkusDispatched += Number(it.quantity) || 0;
      }
    }
  }

  let topCamera = "—";
  let maxCount = 0;
  for (const [cam, count] of Object.entries(cameraCounts)) {
    if (count > maxCount) {
      maxCount = count;
      topCamera = cam;
    }
  }

  const mappedItems = items.map((it) => ({
    ...it,
    screenshotPhotoUrl:
      sanitizeCctvEvidenceUrl(it.screenshotPhotoUrl) ||
      sanitizeCctvEvidenceUrl(it.evidenceUrl) ||
      (it.cctvLabelId ? `/api/cctv/evidence?labelId=${it.cctvLabelId}` : null),
    evidenceUrl:
      sanitizeCctvEvidenceUrl(it.evidenceUrl) ||
      sanitizeCctvEvidenceUrl(it.screenshotPhotoUrl) ||
      (it.cctvLabelId ? `/api/cctv/evidence?labelId=${it.cctvLabelId}` : null),
  }));

  return {
    items: mappedItems,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    summary: {
      totalOutboundPackages: total,
      totalSkusDispatched,
      topCamera,
      cameraCounts,
    },
  };
}

export async function getCctvDashboardSummary() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const todayRange = { gte: startOfDay, lte: endOfDay };
  const todayPackingCond = getPackingDateCondition(todayRange);
  const todayActivityCond = getActivityDateCondition(todayRange);

  const [totalPackedToday, totalDetectionsToday, totalAnomaliesToday, recentPacked, liveSystem] =
    await Promise.all([
      prisma.cctvDetectionLog.count({
        where: {
          eventType: "packing_completed",
          ...todayPackingCond,
        },
      }),
      prisma.cctvDetectionLog.count({
        where: todayActivityCond,
      }),
      prisma.cctvDetectionLog.count({
        where: {
          OR: [
            { eventType: "anomaly" },
            { matchStatus: "unmatched" },
            { matchStatus: "review" },
          ],
          AND: [todayActivityCond],
        },
      }),
      prisma.cctvDetectionLog.findMany({
        where: {
          eventType: "packing_completed",
        },
        orderBy: [{ packingCompletedAt: "desc" }, { createdAt: "desc" }],
        take: 5,
        include: {
          salesRecord: {
            select: {
              id: true,
              transactionNumber: true,
              customerName: true,
              total: true,
            },
          },
        },
      }),
      getCctvSystemStatus().catch(() => null),
    ]);

  const serializedRecentPacked = recentPacked.map((item) => ({
    ...item,
    screenshotPhotoUrl:
      sanitizeCctvEvidenceUrl(item.screenshotPhotoUrl) ||
      sanitizeCctvEvidenceUrl(item.evidenceUrl) ||
      (item.cctvLabelId ? `/api/cctv/evidence?labelId=${item.cctvLabelId}` : null),
    evidenceUrl:
      sanitizeCctvEvidenceUrl(item.evidenceUrl) ||
      sanitizeCctvEvidenceUrl(item.screenshotPhotoUrl) ||
      (item.cctvLabelId ? `/api/cctv/evidence?labelId=${item.cctvLabelId}` : null),
    salesRecord: item.salesRecord
      ? {
          id: item.salesRecord.id,
          transactionNumber: item.salesRecord.transactionNumber,
          customerName: item.salesRecord.customerName,
          total: item.salesRecord.total != null ? Number(item.salesRecord.total) : 0,
        }
      : null,
  }));

  return {
    today: {
      totalPacked: totalPackedToday,
      totalDetections: totalDetectionsToday,
      totalAnomalies: totalAnomaliesToday,
    },
    recentPacked: serializedRecentPacked,
    liveSystem,
  };
}

export interface CctvAnomaliesFilter {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  search?: string;
  cameraName?: string;
}

export async function getCctvAnomaliesReport(filter: CctvAnomaliesFilter) {
  const page = Math.max(1, Number(filter.page) || 1);
  const pageSize = Math.max(5, Math.min(100, Number(filter.pageSize) || 20));
  const skip = (page - 1) * pageSize;

  const where: any = {
    OR: [
      { eventType: "anomaly" },
      { matchStatus: "unmatched" },
      { matchStatus: "review" },
    ],
  };

  if (filter.cameraName && filter.cameraName !== "all") {
    where.cameraName = { contains: filter.cameraName, mode: "insensitive" };
  }

  if (filter.search && filter.search.trim()) {
    const s = filter.search.trim();
    where.AND = [
      {
        OR: [
          { invoiceNumber: { contains: s, mode: "insensitive" } },
          { customerName: { contains: s, mode: "insensitive" } },
          { notes: { contains: s, mode: "insensitive" } },
        ],
      },
    ];
  }

  const dateRange = parseDateFilterRange(filter.from, filter.to);
  if (dateRange) {
    where.AND = [
      ...(where.AND || []),
      getActivityDateCondition(dateRange),
    ];
  }

  const [items, total] = await Promise.all([
    prisma.cctvDetectionLog.findMany({
      where,
      orderBy: [{ firstSeenAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
    }),
    prisma.cctvDetectionLog.count({ where }),
  ]);

  const mappedItems = items.map((it) => ({
    ...it,
    screenshotPhotoUrl:
      sanitizeCctvEvidenceUrl(it.screenshotPhotoUrl) ||
      sanitizeCctvEvidenceUrl(it.evidenceUrl) ||
      (it.cctvLabelId ? `/api/cctv/evidence?labelId=${it.cctvLabelId}` : null),
    evidenceUrl:
      sanitizeCctvEvidenceUrl(it.evidenceUrl) ||
      sanitizeCctvEvidenceUrl(it.screenshotPhotoUrl) ||
      (it.cctvLabelId ? `/api/cctv/evidence?labelId=${it.cctvLabelId}` : null),
  }));

  return {
    items: mappedItems,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getCctvCamerasReport() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const todayRange = { gte: startOfDay, lte: endOfDay };
  const todayActivityCond = getActivityDateCondition(todayRange);

  const [allTimeGroupBy, todayGroupBy, liveSystem] = await Promise.all([
    prisma.cctvDetectionLog.groupBy({
      by: ["cameraName"],
      where: { cameraName: { not: null } },
      _count: { id: true },
      _max: { packingCompletedAt: true, createdAt: true },
    }),
    prisma.cctvDetectionLog.groupBy({
      by: ["cameraName"],
      where: {
        cameraName: { not: null },
        ...todayActivityCond,
      },
      _count: { id: true },
    }),
    getCctvSystemStatus().catch(() => null),
  ]);

  const todayCountMap: Record<string, number> = {};
  for (const t of todayGroupBy) {
    if (t.cameraName) todayCountMap[t.cameraName] = t._count.id;
  }

  const cameras = allTimeGroupBy
    .filter((g): g is typeof g & { cameraName: string } => Boolean(g.cameraName))
    .map((g) => ({
      name: g.cameraName,
      totalAllTime: g._count.id,
      totalToday: todayCountMap[g.cameraName] || 0,
      lastSeenAt: g._max.packingCompletedAt || g._max.createdAt,
      isOnline: liveSystem?.cameras?.some((c) => c.name.toLowerCase() === g.cameraName.toLowerCase() && c.status === "online") ?? true,
    }));

  return {
    cameras,
    liveSystem,
  };
}

