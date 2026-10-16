import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CCTV_BASE_URL = process.env.CCTV_BASE_URL || "http://31.97.51.194:8000";
const CCTV_TOKEN =
  process.env.SLM_API_TOKEN ||
  process.env.CCTV_API_TOKEN ||
  process.env.CCTV_INTEGRATION_TOKEN ||
  "cctv_slm_8e119688c48b1880da69c9ab632b6c415ddc5f4d94467ea50305b951c5a0d04b";

async function fetchSnapshotCaptureDateStandalone(
  evidenceUrl?: string | null,
  labelId?: number | string | null
): Promise<Date | null> {
  let targetUrl: string | null = null;
  if (evidenceUrl && typeof evidenceUrl === "string") {
    const trimmed = evidenceUrl.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      targetUrl = trimmed;
    } else if (trimmed.startsWith("/")) {
      targetUrl = `${CCTV_BASE_URL.replace(/\/+$/, "")}/${trimmed.replace(/^\/+/, "")}`;
    }
  }

  if (!targetUrl && labelId) {
    targetUrl = `${CCTV_BASE_URL.replace(/\/+$/, "")}/api/v1/slm/evidence/label-snapshot/${labelId}`;
  }

  if (!targetUrl) return null;

  try {
    const parsed = new URL(targetUrl);
    if (!parsed.searchParams.has("token")) {
      parsed.searchParams.set("token", CCTV_TOKEN);
    }
    const res = await fetch(parsed.toString(), {
      method: "HEAD",
      headers: {
        Authorization: `Bearer ${CCTV_TOKEN}`,
        "X-CCTV-Token": CCTV_TOKEN,
        "X-SLM-Token": CCTV_TOKEN,
      },
      signal: AbortSignal.timeout(2000),
    });

    if (res.ok) {
      const lastModified = res.headers.get("last-modified");
      if (lastModified) {
        const d = new Date(lastModified);
        if (!isNaN(d.getTime())) {
          return d;
        }
      }
    }
  } catch {
    // Non-blocking fallback
  }

  return null;
}

async function main() {
  console.log("=== Memulai Remediasi Timestamp CCTV Detection Log ===");

  const logs = await prisma.cctvDetectionLog.findMany({
    where: {
      OR: [
        { evidenceUrl: { not: null } },
        { cctvLabelId: { not: null } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Ditemukan ${logs.length} data CCTV detection log.`);
  let updatedCount = 0;

  for (const log of logs) {
    try {
      const physicalDate = await fetchSnapshotCaptureDateStandalone(log.evidenceUrl, log.cctvLabelId);
      if (!physicalDate) {
        continue;
      }

      const currentDate = log.packingCompletedAt || log.createdAt;
      const diffMs = Math.abs(currentDate.getTime() - physicalDate.getTime());

      // Jika perbedaan lebih dari 10 menit antara fisik dan database, sinkronkan
      if (diffMs > 10 * 60 * 1000) {
        console.log(
          `[UPDATE] Log #${log.id} (Invoice: ${log.invoiceNumber || "—"}, Label: ${log.cctvLabelId})`
        );
        console.log(`  Sebelum : ${currentDate.toISOString()}`);
        console.log(`  Sesudah : ${physicalDate.toISOString()}`);

        await prisma.cctvDetectionLog.update({
          where: { id: log.id },
          data: {
            packingCompletedAt: physicalDate,
            firstSeenAt: physicalDate,
          },
        });

        if (log.deliveryOrderId) {
          await prisma.deliveryOrder.update({
            where: { id: log.deliveryOrderId },
            data: { packedAt: physicalDate },
          });
        }

        updatedCount++;
      }
    } catch (err) {
      console.warn(`Gagal memproses log #${log.id}:`, err);
    }
  }

  console.log(`=== Selesai. Total data diselaraskan: ${updatedCount} baris. ===`);
}

main()
  .catch((e) => {
    console.error("Error running remediation:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
