import "server-only";
import { readdir, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

export interface CctvCleanupOptions {
  dryRun?: boolean;
  normalRetentionDays?: number;
  anomalyRetentionDays?: number;
  payloadRetentionDays?: number;
  fileRetentionDays?: number;
  uploadDir?: string;
}

export interface CctvCleanupResult {
  success: boolean;
  dryRun: boolean;
  executedAt: string;
  database: {
    payloadsPruned: number;
    normalLogsDeleted: number;
    anomalyLogsDeleted: number;
    totalLogsDeleted: number;
  };
  disk: {
    directory: string;
    filesScanned: number;
    filesDeleted: number;
    bytesFreed: number;
    mbFreed: number;
  };
  retentionRules: {
    normalRetentionDays: number;
    anomalyRetentionDays: number;
    payloadRetentionDays: number;
    fileRetentionDays: number;
  };
}

export const DEFAULT_RETENTION_RULES = {
  normalRetentionDays: 60,
  anomalyRetentionDays: 180,
  payloadRetentionDays: 14,
  fileRetentionDays: 60,
};

/**
 * Membersihkan log CCTV lama di database dan file screenshot fisik di disk.
 * Mendukung dryRun untuk simulasi tanpa penghapusan permanen.
 */
export async function cleanupCctvStorage(options: CctvCleanupOptions = {}): Promise<CctvCleanupResult> {
  const dryRun = Boolean(options.dryRun);
  const normalRetentionDays = Math.max(1, options.normalRetentionDays ?? DEFAULT_RETENTION_RULES.normalRetentionDays);
  const anomalyRetentionDays = Math.max(1, options.anomalyRetentionDays ?? DEFAULT_RETENTION_RULES.anomalyRetentionDays);
  const payloadRetentionDays = Math.max(1, options.payloadRetentionDays ?? DEFAULT_RETENTION_RULES.payloadRetentionDays);
  const fileRetentionDays = Math.max(1, options.fileRetentionDays ?? DEFAULT_RETENTION_RULES.fileRetentionDays);

  const now = Date.now();
  const normalCutoff = new Date(now - normalRetentionDays * 86_400_000);
  const anomalyCutoff = new Date(now - anomalyRetentionDays * 86_400_000);
  const payloadCutoff = new Date(now - payloadRetentionDays * 86_400_000);
  const fileCutoffTime = now - fileRetentionDays * 86_400_000;

  // 1. Database: Truncate rawPayload untuk log lama (> payloadRetentionDays)
  let payloadsPruned = 0;
  try {
    if (dryRun) {
      payloadsPruned = await prisma.cctvDetectionLog.count({
        where: {
          createdAt: { lt: payloadCutoff },
          rawPayload: { not: Prisma.DbNull },
        },
      });
    } else {
      const res = await prisma.cctvDetectionLog.updateMany({
        where: {
          createdAt: { lt: payloadCutoff },
          rawPayload: { not: Prisma.DbNull },
        },
        data: {
          rawPayload: Prisma.DbNull,
        },
      });
      payloadsPruned = res.count;
    }
  } catch (err) {
    console.error("CCTV Cleanup - Prune rawPayload error:", err);
  }

  // 2. Database: Hapus log normal (> normalRetentionDays dan severity info)
  let normalLogsDeleted = 0;
  try {
    if (dryRun) {
      normalLogsDeleted = await prisma.cctvDetectionLog.count({
        where: {
          createdAt: { lt: normalCutoff },
          severity: "info",
        },
      });
    } else {
      const res = await prisma.cctvDetectionLog.deleteMany({
        where: {
          createdAt: { lt: normalCutoff },
          severity: "info",
        },
      });
      normalLogsDeleted = res.count;
    }
  } catch (err) {
    console.error("CCTV Cleanup - Delete normal logs error:", err);
  }

  // 3. Database: Hapus log anomali / dispute (> anomalyRetentionDays)
  let anomalyLogsDeleted = 0;
  try {
    if (dryRun) {
      anomalyLogsDeleted = await prisma.cctvDetectionLog.count({
        where: {
          createdAt: { lt: anomalyCutoff },
        },
      });
    } else {
      const res = await prisma.cctvDetectionLog.deleteMany({
        where: {
          createdAt: { lt: anomalyCutoff },
        },
      });
      anomalyLogsDeleted = res.count;
    }
  } catch (err) {
    console.error("CCTV Cleanup - Delete anomaly logs error:", err);
  }

  // 4. Disk Storage: Bersihkan berkas foto fisik cctv-pack-* di public/uploads/receipts/
  const targetDir = options.uploadDir || path.join(process.cwd(), "public", "uploads", "receipts");
  let filesScanned = 0;
  let filesDeleted = 0;
  let bytesFreed = 0;

  if (existsSync(targetDir)) {
    try {
      const entries = await readdir(targetDir);
      for (const entry of entries) {
        // HANYA bersihkan file spesifik hasil tangkapan CCTV (cctv-pack-*),
        // file nota bukti transfer bank (receipt-*) atau file lain TIDAK disentuh sama sekali
        if (!/^cctv-pack-.*\.(jpg|jpeg|png|webp)$/i.test(entry)) {
          continue;
        }

        filesScanned++;
        const filePath = path.join(targetDir, entry);

        try {
          const stats = await stat(filePath);
          if (stats.mtimeMs < fileCutoffTime) {
            filesDeleted++;
            bytesFreed += stats.size;
            if (!dryRun) {
              await unlink(filePath).catch((unlinkErr) => {
                console.warn(`Gagal menghapus berkas CCTV ${entry}:`, unlinkErr);
              });
            }
          }
        } catch (statErr) {
          console.warn(`Gagal membaca metadata berkas ${entry}:`, statErr);
        }
      }
    } catch (readDirErr) {
      console.error("CCTV Cleanup - Gagal membaca direktori uploads:", readDirErr);
    }
  }

  const totalLogsDeleted = normalLogsDeleted + anomalyLogsDeleted;
  const mbFreed = Number((bytesFreed / (1024 * 1024)).toFixed(2));

  const result: CctvCleanupResult = {
    success: true,
    dryRun,
    executedAt: new Date().toISOString(),
    database: {
      payloadsPruned,
      normalLogsDeleted,
      anomalyLogsDeleted,
      totalLogsDeleted,
    },
    disk: {
      directory: targetDir,
      filesScanned,
      filesDeleted,
      bytesFreed,
      mbFreed,
    },
    retentionRules: {
      normalRetentionDays,
      anomalyRetentionDays,
      payloadRetentionDays,
      fileRetentionDays,
    },
  };

  // 5. Catat ke AuditLog jika perubahan fisik terjadi (bukan dryRun)
  if (!dryRun && (totalLogsDeleted > 0 || filesDeleted > 0 || payloadsPruned > 0)) {
    try {
      await prisma.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          entityType: "cctv_storage",
          entityId: `cleanup-${Date.now()}`,
          action: "cleanup",
          userId: "system:cron",
          userNameSnapshot: "CCTV Storage Cleanup",
          userRoleSnapshot: "OWNER",
          reason: `Pembersihan storage CCTV: ${totalLogsDeleted} log dihapus, ${payloadsPruned} payload dikosongkan, ${filesDeleted} file fisik dihapus (${mbFreed} MB dibebaskan)`,
          afterValue: result as any,
        },
      });
    } catch (auditErr) {
      console.warn("CCTV Cleanup - Gagal mencatat AuditLog:", auditErr);
    }
  }

  return result;
}
