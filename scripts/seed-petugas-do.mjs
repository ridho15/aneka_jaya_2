import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";
import { loadEnvFiles } from "./load-env.mjs";

loadEnvFiles();

const prisma = new PrismaClient();
const KEY_LENGTH = 64;

function hashPassword(password) {
  const normalized = password.trim();
  if (normalized.length < 8) throw new Error("Password minimal 8 karakter.");
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(normalized, salt, KEY_LENGTH).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

const PETUGAS_DO_LIST = [
  {
    name: "Agus Santoso",
    email: "agus.do@slm.test",
    externalId: "driver-agus-02",
    role: "DELIVERY_DRIVER",
    password: "password123"
  },
  {
    name: "Joko Prasetyo",
    email: "joko.do@slm.test",
    externalId: "driver-joko-03",
    role: "DELIVERY_DRIVER",
    password: "password123"
  },
  {
    name: "Dedi Supriyadi",
    email: "dedi.do@slm.test",
    externalId: "driver-dedi-04",
    role: "DELIVERY_DRIVER",
    password: "password123"
  },
  {
    name: "Wahyu Hidayat",
    email: "wahyu.do@slm.test",
    externalId: "driver-wahyu-05",
    role: "DELIVERY_DRIVER",
    password: "password123"
  }
];

async function main() {
  console.log("Menambahkan data user Petugas DO...");

  for (const item of PETUGAS_DO_LIST) {
    const passwordHash = hashPassword(item.password);

    const user = await prisma.user.upsert({
      where: { externalId: item.externalId },
      update: {
        name: item.name,
        email: item.email,
        role: item.role,
        isActive: true,
        passwordHash,
        passwordUpdatedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null
      },
      create: {
        id: crypto.randomUUID(),
        externalId: item.externalId,
        email: item.email,
        name: item.name,
        role: item.role,
        isActive: true,
        passwordHash,
        passwordUpdatedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null
      }
    });

    console.log(`✓ Petugas DO ditambahkan/diperbarui: ${user.name} (${user.email} / ${user.externalId})`);
  }

  const allDrivers = await prisma.user.findMany({
    where: { role: "DELIVERY_DRIVER", isActive: true },
    select: { id: true, name: true, email: true, externalId: true }
  });

  console.log(`\nTotal Petugas DO aktif saat ini: ${allDrivers.length}`);
  console.table(allDrivers);
}

main()
  .catch((err) => {
    console.error("Gagal menambahkan data Petugas DO:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
