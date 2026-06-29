import { PrismaClient } from "@prisma/client";
import { loadEnvFiles } from "./load-env.mjs";

loadEnvFiles();

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL wajib diisi untuk seed master data.");

  await prisma.$transaction(async (tx) => {
    const types = [
      { id: "W", code: "W", name: "Walk In", rekeningId: "cash-w", rekeningName: "Kas Walk In", sortOrder: 1 },
      { id: "AJ", code: "AJ", name: "Aneka Jaya", rekeningId: "cash-aj", rekeningName: "Kas AJ", sortOrder: 2 },
      { id: "LSM", code: "LSM", name: "LSM", rekeningId: "cash-lsm", rekeningName: "Kas LSM", sortOrder: 3 }
    ];
    for (const tipe of types) {
      await tx.bookkeepingType.upsert({
        where: { id: tipe.id },
        create: { id: tipe.id, code: tipe.code, name: tipe.name, isActive: true, sortOrder: tipe.sortOrder },
        update: { code: tipe.code, name: tipe.name, isActive: true, sortOrder: tipe.sortOrder }
      });
      await tx.rekeningAccount.upsert({
        where: { id: tipe.rekeningId },
        create: { id: tipe.rekeningId, name: tipe.rekeningName, accountNumber: "-", bankName: "Cash", isActive: true },
        update: { name: tipe.rekeningName, isActive: true }
      });
      await tx.rekeningAccountBookkeepingType.upsert({
        where: { rekeningAccountId_bookkeepingTypeId: { rekeningAccountId: tipe.rekeningId, bookkeepingTypeId: tipe.id } },
        create: { rekeningAccountId: tipe.rekeningId, bookkeepingTypeId: tipe.id },
        update: {}
      });
    }
  });

  console.log(JSON.stringify({ ok: true, bookkeepingTypes: ["W", "AJ", "LSM"], rekenings: ["cash-w", "cash-aj", "cash-lsm"] }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
