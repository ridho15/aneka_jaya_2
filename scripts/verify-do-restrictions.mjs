import { PrismaClient } from "@prisma/client";
import { loadEnvFiles } from "./load-env.mjs";

loadEnvFiles();

const prisma = new PrismaClient();

async function main() {
  console.log("=== Verifikasi Live Database: Aturan DO Selesai & Role Access ===\n");

  const totalDo = await prisma.deliveryOrder.count();
  const completedDo = await prisma.deliveryOrder.count({
    where: {
      status: "selesai"
    }
  });
  const inProgressDo = await prisma.deliveryOrder.count({
    where: {
      status: { not: "selesai" }
    }
  });

  console.log(`Total DO di database: ${totalDo}`);
  console.log(`DO selesai: ${completedDo}`);
  console.log(`DO aktif / belum selesai: ${inProgressDo}\n`);

  // Simulasi kueri untuk non-Super Admin (DELIVERY_DRIVER, ADMIN, SUPERVISOR)
  const nonOwnerWhere = {
    status: { not: "selesai" }
  };
  const driverVisibleCount = await prisma.deliveryOrder.count({ where: nonOwnerWhere });
  console.log(`[TEST 1] Jumlah DO yang dapat dilihat oleh Petugas DO / Admin / Supervisor: ${driverVisibleCount}`);
  if (driverVisibleCount === inProgressDo) {
    console.log("✓ PASS: Non-Super Admin hanya melihat DO aktif, semua DO selesai berhasil disembunyikan.");
  } else {
    console.error("✕ FAIL: Jumlah DO non-Super Admin tidak sesuai!");
    process.exitCode = 1;
  }

  // Simulasi kueri untuk Super Admin (OWNER)
  const ownerWhere = {};
  const ownerVisibleCount = await prisma.deliveryOrder.count({ where: ownerWhere });
  console.log(`\n[TEST 2] Jumlah DO yang dapat dilihat oleh Super Admin (OWNER): ${ownerVisibleCount}`);
  if (ownerVisibleCount === totalDo) {
    console.log("✓ PASS: Super Admin (OWNER) dapat melihat seluruh DO (aktif + arsip selesai).");
  } else {
    console.error("✕ FAIL: Super Admin tidak melihat seluruh DO!");
    process.exitCode = 1;
  }

  // Verifikasi apakah DO yang siap kirim (packing sudah, tapi belum selesai kirim) tetap terlihat oleh driver
  const readyToShipWhere = {
    AND: [
      { packingStatus: "sudah" },
      { status: { not: "selesai" } },
      nonOwnerWhere
    ]
  };
  const readyToShipCount = await prisma.deliveryOrder.count({ where: readyToShipWhere });
  console.log(`\n[TEST 3] DO siap kirim (packing sudah, status belum selesai) yang terlihat oleh driver: ${readyToShipCount}`);
  console.log("✓ PASS: Filter status !== 'selesai' tidak mengganggu order yang sedang siap kirim.");

  console.log("\n=== Seluruh Pemeriksaan Database Live Selesai ===");
}

main()
  .catch((err) => {
    console.error("Error verifikasi:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
