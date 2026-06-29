import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const REQUIRED_ENV = [
  ["AUTH_PROVIDER", "trusted_header", "Set AUTH_PROVIDER=trusted_header untuk login operasional."],
  ["AUTH_TRUSTED_HEADER_SECRET", null, "Isi AUTH_TRUSTED_HEADER_SECRET dengan secret kuat."],
  ["AUTH_SSO_LOGIN_URL", null, "Isi AUTH_SSO_LOGIN_URL dengan URL gateway/SSO."],
  ["ANIKA_ERP_API_BASE_URL", null, "Isi ANIKA_ERP_API_BASE_URL untuk ERP asli."],
  ["ANIKA_ERP_API_TOKEN", null, "Isi ANIKA_ERP_API_TOKEN untuk ERP asli."]
];

export async function checkCoreReadiness(env = process.env, prisma = new PrismaClient()) {
  const checks = [];

  function addCheck(name, ok, recommendation, details = undefined) {
    checks.push({ name, ok, recommendation: ok ? null : recommendation, details });
  }

  for (const [key, expected, recommendation] of REQUIRED_ENV) {
    const value = env[key]?.trim();
    addCheck(
      `env:${key}`,
      expected ? value === expected : Boolean(value),
      recommendation,
      expected ? { expected, actual: value || null } : undefined
    );
  }

  if (!env.DATABASE_URL?.trim()) {
    addCheck("database:DATABASE_URL", false, "Isi DATABASE_URL sebelum menjalankan readiness check.");
  } else {
    addCheck("database:DATABASE_URL", true, null);
    try {
      await prisma.$queryRaw`SELECT 1`;
      const [ownerCount, activeTipeCount, activeRekeningCount, rekeningTipeLinkCount] = await Promise.all([
        prisma.user.count({ where: { role: "OWNER", isActive: true } }),
        prisma.bookkeepingType.count({ where: { isActive: true } }),
        prisma.rekeningAccount.count({ where: { isActive: true } }),
        prisma.rekeningAccountBookkeepingType.count()
      ]);

      addCheck("data:active-owner", ownerCount > 0, "Jalankan npm run db:seed-owner atau buat Super Admin aktif.", { count: ownerCount });
      addCheck("data:active-bookkeeping-type", activeTipeCount > 0, "Super Admin wajib membuat minimal satu tipe pembukuan nyata.", { count: activeTipeCount });
      addCheck("data:active-rekening", activeRekeningCount > 0, "Super Admin wajib membuat minimal satu rekening kas/bank nyata.", { count: activeRekeningCount });
      addCheck("data:rekening-tipe-link", rekeningTipeLinkCount > 0, "Hubungkan minimal satu rekening ke tipe pembukuan.", { count: rekeningTipeLinkCount });
    } catch (error) {
      addCheck(
        "database:schema",
        false,
        "Database belum siap. Jalankan migrasi Prisma sebelum readiness check.",
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  const passed = checks.filter((check) => check.ok).map((check) => check.name);
  const failed = checks.filter((check) => !check.ok);
  return { ok: failed.length === 0, passed, failed };
}

function loadLocalEnv(env = process.env) {
  const filePath = path.join(process.cwd(), ".env.local");
  if (!existsSync(filePath)) return env;
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!env[key]) env[key] = value;
  }
  return env;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prisma = new PrismaClient();
  checkCoreReadiness(loadLocalEnv(), prisma)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
