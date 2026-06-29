import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL wajib diisi untuk seed initial owner.");
  const existingOwner = await prisma.user.findFirst({ where: { role: "OWNER", isActive: true }, select: { id: true } });
  if (existingOwner) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: "Active OWNER already exists" }, null, 2));
    return;
  }
  const externalId = process.env.INITIAL_OWNER_EXTERNAL_ID?.trim();
  if (!externalId) throw new Error("INITIAL_OWNER_EXTERNAL_ID wajib diisi untuk membuat Owner pertama.");
  const user = await prisma.user.upsert({
    where: { externalId },
    update: {
      role: "OWNER",
      isActive: true,
      name: process.env.INITIAL_OWNER_NAME?.trim() || "Owner",
      email: process.env.INITIAL_OWNER_EMAIL?.trim().toLowerCase() || null
    },
    create: {
      id: crypto.randomUUID(),
      externalId,
      email: process.env.INITIAL_OWNER_EMAIL?.trim().toLowerCase() || null,
      name: process.env.INITIAL_OWNER_NAME?.trim() || "Owner",
      role: "OWNER",
      isActive: true
    }
  });
  console.log(JSON.stringify({ ok: true, user: { id: user.id, externalId: user.externalId, email: user.email, name: user.name, role: user.role } }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
