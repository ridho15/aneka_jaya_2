import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { cleanupCctvStorage, DEFAULT_RETENTION_RULES } from "@/lib/cctv/cleanup";
import { POST, GET } from "@/app/api/jobs/cleanup-cctv-storage/route";
import path from "node:path";
import { mkdir, writeFile, utimes, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

describe("CCTV Storage & Log Cleanup Service (lib/cctv/cleanup.ts)", () => {
  const testUploadDir = path.join(process.cwd(), "tests", "scratch_uploads_cctv");

  beforeAll(async () => {
    await mkdir(testUploadDir, { recursive: true });
  });

  afterAll(async () => {
    if (existsSync(testUploadDir)) {
      await rm(testUploadDir, { recursive: true, force: true });
    }
  });

  it("should have sensible default retention rules", () => {
    expect(DEFAULT_RETENTION_RULES.normalRetentionDays).toBe(60);
    expect(DEFAULT_RETENTION_RULES.anomalyRetentionDays).toBe(180);
    expect(DEFAULT_RETENTION_RULES.payloadRetentionDays).toBe(14);
    expect(DEFAULT_RETENTION_RULES.fileRetentionDays).toBe(60);
  });

  it("should simulate cleanup without deleting data in dryRun mode", async () => {
    // 1. Siapkan file mock di testUploadDir
    const oldCctvFile = path.join(testUploadDir, "cctv-pack-test-old.jpg");
    const newCctvFile = path.join(testUploadDir, "cctv-pack-test-new.jpg");
    const nonCctvFile = path.join(testUploadDir, "receipt-transfer-test.jpg");

    await writeFile(oldCctvFile, "dummy old cctv content");
    await writeFile(newCctvFile, "dummy new cctv content");
    await writeFile(nonCctvFile, "dummy non cctv content");

    // Set mtime: file lama = 70 hari lalu, file baru = 2 hari lalu
    const oldTime = (Date.now() - 70 * 86_400_000) / 1000;
    const newTime = (Date.now() - 2 * 86_400_000) / 1000;
    await utimes(oldCctvFile, oldTime, oldTime);
    await utimes(newCctvFile, newTime, newTime);
    await utimes(nonCctvFile, oldTime, oldTime);

    // 2. Siapkan log database
    const oldNormalLog = await prisma.cctvDetectionLog.create({
      data: {
        invoiceNumber: "INV-DRYRUN-OLD",
        severity: "info",
        rawPayload: { test: true },
        createdAt: new Date(Date.now() - 70 * 86_400_000),
      },
    });

    try {
      const res = await cleanupCctvStorage({
        dryRun: true,
        uploadDir: testUploadDir,
        normalRetentionDays: 60,
        anomalyRetentionDays: 180,
        payloadRetentionDays: 14,
        fileRetentionDays: 60,
      });

      expect(res.success).toBe(true);
      expect(res.dryRun).toBe(true);
      expect(res.disk.filesScanned).toBe(2); // Hanya 2 file cctv-pack-*
      expect(res.disk.filesDeleted).toBe(1); // 1 file lama teridentifikasi
      expect(res.database.normalLogsDeleted).toBeGreaterThanOrEqual(1);

      // Verifikasi TIDAK ADA yang terhapus secara fisik di disk
      expect(existsSync(oldCctvFile)).toBe(true);
      expect(existsSync(newCctvFile)).toBe(true);
      expect(existsSync(nonCctvFile)).toBe(true);

      // Verifikasi log database masih ada
      const stillThere = await prisma.cctvDetectionLog.findUnique({
        where: { id: oldNormalLog.id },
      });
      expect(stillThere).not.toBeNull();
    } finally {
      await prisma.cctvDetectionLog.delete({ where: { id: oldNormalLog.id } }).catch(() => {});
    }
  }, 20000);

  it("should perform real cleanup: delete expired CCTV files & logs, preserving non-CCTV and recent data", async () => {
    const oldCctvFile = path.join(testUploadDir, "cctv-pack-real-old.jpg");
    const newCctvFile = path.join(testUploadDir, "cctv-pack-real-new.jpg");
    const nonCctvFile = path.join(testUploadDir, "receipt-important-doc.jpg");

    await writeFile(oldCctvFile, "old cctv bytes");
    await writeFile(newCctvFile, "recent cctv bytes");
    await writeFile(nonCctvFile, "important manual receipt bytes");

    const oldTime = (Date.now() - 75 * 86_400_000) / 1000;
    const newTime = (Date.now() - 3 * 86_400_000) / 1000;
    await utimes(oldCctvFile, oldTime, oldTime);
    await utimes(newCctvFile, newTime, newTime);
    await utimes(nonCctvFile, oldTime, oldTime);

    // Database logs:
    // 1. Log normal kadaluwarsa (> 60 hari)
    const oldNormalLog = await prisma.cctvDetectionLog.create({
      data: {
        invoiceNumber: "INV-REAL-NORMAL-OLD",
        severity: "info",
        rawPayload: { info: "payload" },
        createdAt: new Date(Date.now() - 75 * 86_400_000),
      },
    });

    // 2. Log normal baru (< 60 hari tapi > 14 hari) -> rawPayload harus di-truncate, row tetap ada
    const mediumNormalLog = await prisma.cctvDetectionLog.create({
      data: {
        invoiceNumber: "INV-REAL-NORMAL-MED",
        severity: "info",
        rawPayload: { bigPayload: "should be pruned" },
        createdAt: new Date(Date.now() - 25 * 86_400_000),
      },
    });

    // 3. Log anomali umur 75 hari -> HARUS DIJAGA (karena retensi anomali 180 hari)
    const activeAnomalyLog = await prisma.cctvDetectionLog.create({
      data: {
        invoiceNumber: "INV-REAL-ANOMALY-ACTIVE",
        severity: "warning",
        createdAt: new Date(Date.now() - 75 * 86_400_000),
      },
    });

    // 4. Log anomali sangat tua (> 180 hari) -> HARUS TERHAPUS
    const expiredAnomalyLog = await prisma.cctvDetectionLog.create({
      data: {
        invoiceNumber: "INV-REAL-ANOMALY-EXPIRED",
        severity: "critical",
        createdAt: new Date(Date.now() - 200 * 86_400_000),
      },
    });

    try {
      const res = await cleanupCctvStorage({
        dryRun: false,
        uploadDir: testUploadDir,
        normalRetentionDays: 60,
        anomalyRetentionDays: 180,
        payloadRetentionDays: 14,
        fileRetentionDays: 60,
      });

      expect(res.success).toBe(true);
      expect(res.dryRun).toBe(false);

      // 1. Verifikasi disk
      expect(existsSync(oldCctvFile)).toBe(false); // Terhapus
      expect(existsSync(newCctvFile)).toBe(true); // Terjaga (belum kedaluwarsa)
      expect(existsSync(nonCctvFile)).toBe(true); // Terjaga (bukan file CCTV!)

      // 2. Verifikasi database
      const checkOldNormal = await prisma.cctvDetectionLog.findUnique({
        where: { id: oldNormalLog.id },
      });
      expect(checkOldNormal).toBeNull(); // Terhapus

      const checkMediumNormal = await prisma.cctvDetectionLog.findUnique({
        where: { id: mediumNormalLog.id },
      });
      expect(checkMediumNormal).not.toBeNull(); // Row tetap ada
      expect(checkMediumNormal?.rawPayload).toBeNull(); // Payload berhasil di-truncate

      const checkActiveAnomaly = await prisma.cctvDetectionLog.findUnique({
        where: { id: activeAnomalyLog.id },
      });
      expect(checkActiveAnomaly).not.toBeNull(); // Anomali 75 hari tetap aman dijaga

      const checkExpiredAnomaly = await prisma.cctvDetectionLog.findUnique({
        where: { id: expiredAnomalyLog.id },
      });
      expect(checkExpiredAnomaly).toBeNull(); // Anomali 200 hari terhapus
    } finally {
      // Cleanup
      await prisma.cctvDetectionLog.deleteMany({
        where: {
          id: {
            in: [oldNormalLog.id, mediumNormalLog.id, activeAnomalyLog.id, expiredAnomalyLog.id],
          },
        },
      }).catch(() => {});
    }
  }, 20000);
});

describe("CCTV Cleanup Cron Job API (/api/jobs/cleanup-cctv-storage)", () => {
  const originalEnv = process.env.CRON_SECRET;

  beforeAll(() => {
    process.env.CRON_SECRET = "test-cron-secret-123";
  });

  afterAll(() => {
    process.env.CRON_SECRET = originalEnv;
  });

  it("should reject unauthorized requests without valid secret", async () => {
    const req = new Request("http://localhost:3000/api/jobs/cleanup-cctv-storage", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it("should accept authorized GET requests with dryRun=true and query secret", async () => {
    const req = new Request("http://localhost:3000/api/jobs/cleanup-cctv-storage?secret=test-cron-secret-123&dryRun=true");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.dryRun).toBe(true);
    expect(json.data.database).toBeDefined();
    expect(json.data.disk).toBeDefined();
  });

  it("should accept authorized POST requests with x-cron-secret header", async () => {
    const req = new Request("http://localhost:3000/api/jobs/cleanup-cctv-storage", {
      method: "POST",
      headers: {
        "x-cron-secret": "test-cron-secret-123",
        "content-type": "application/json",
      },
      body: JSON.stringify({ dryRun: true }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.dryRun).toBe(true);
  });
});
