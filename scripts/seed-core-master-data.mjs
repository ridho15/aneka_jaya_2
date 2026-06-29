import { PrismaClient } from "@prisma/client";
import { loadEnvFiles } from "./load-env.mjs";

loadEnvFiles();

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL wajib diisi untuk seed master data.");

  await prisma.$transaction(async (tx) => {
    await tx.bookkeepingType.upsert({
      where: { id: "W" },
      create: { id: "W", code: "W", name: "Walk In", isActive: true, sortOrder: 1 },
      update: { code: "W", isActive: true, sortOrder: 1 }
    });
    await tx.rekeningAccount.upsert({
      where: { id: "cash-w" },
      create: { id: "cash-w", name: "Kas Walk In", accountNumber: "-", bankName: "Cash", isActive: true },
      update: { isActive: true }
    });
    await tx.rekeningAccountBookkeepingType.upsert({
      where: { rekeningAccountId_bookkeepingTypeId: { rekeningAccountId: "cash-w", bookkeepingTypeId: "W" } },
      create: { rekeningAccountId: "cash-w", bookkeepingTypeId: "W" },
      update: {}
    });
  });

  console.log(JSON.stringify({ ok: true, bookkeepingType: "W", rekening: "cash-w" }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
