import { PrismaClient } from "@prisma/client";
import { loadEnvFiles } from "./load-env.mjs";

const REQUIRED_ENV = [
  ["AUTH_PROVIDER", "local_credentials", "Set AUTH_PROVIDER=local_credentials untuk login internal."],
  ["AUTH_SESSION_SECRET", null, "Isi AUTH_SESSION_SECRET dengan secret kuat untuk session login internal."],
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
      const [ownerCount, ownerWithPasswordCount, activeTipeCount, activeRekeningCount, rekeningTipeLinkCount] = await Promise.all([
        prisma.user.count({ where: { role: "OWNER", isActive: true } }),
        prisma.user.count({ where: { role: "OWNER", isActive: true, passwordHash: { not: null } } }),
        prisma.bookkeepingType.count({ where: { isActive: true } }),
        prisma.rekeningAccount.count({ where: { isActive: true } }),
        prisma.rekeningAccountBookkeepingType.count()
      ]);

      addCheck("data:active-owner", ownerCount > 0, "Jalankan npm run db:seed-owner atau buat Super Admin aktif.", { count: ownerCount });
      addCheck("data:active-owner-password", ownerWithPasswordCount > 0, "Set password Owner dengan seed atau reset password dari Super Admin.", { count: ownerWithPasswordCount });
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
  return loadEnvFiles(env);
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
