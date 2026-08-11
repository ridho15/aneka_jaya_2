import { randomBytes, createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const args = Object.fromEntries(process.argv.slice(2).map((entry) => entry.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));
const code = String(args.client || "mj").trim().toLowerCase();
const name = String(args.name || "Majoo (MJ)").trim();
const environment = String(args.environment || "sandbox").trim().toLowerCase();
const expiresAt = args.expires ? new Date(args.expires) : null;
const rotatedFromId = args["rotate-from"] ? String(args["rotate-from"]).trim() : null;

if (!code || !["sandbox", "production"].includes(environment) || (expiresAt && Number.isNaN(expiresAt.getTime()))) {
  console.error("Usage: npm run integration:token:provision -- --client=mj --environment=sandbox [--name='Majoo'] [--expires=2027-01-01] [--rotate-from=token-id]");
  process.exit(1);
}

const prefix = randomBytes(4).toString("hex");
const secret = randomBytes(32).toString("base64url");
const rawToken = `slm_${environment}_${prefix}_${secret}`;
const tokenHash = createHash("sha256").update(rawToken).digest("hex");

try {
  const client = await prisma.integrationClient.upsert({
    where: { code: `${code}-${environment}` },
    create: { id: randomUUID(), code: `${code}-${environment}`, name, environment },
    update: { name, environment, isActive: true }
  });
  if (rotatedFromId) {
    const oldToken = await prisma.integrationToken.findFirst({ where: { id: rotatedFromId, clientId: client.id } });
    if (!oldToken) throw new Error("Token asal rotasi tidak ditemukan untuk client/environment ini.");
  }
  await prisma.integrationToken.create({
    data: { id: randomUUID(), clientId: client.id, tokenHash, prefix, environment, expiresAt, rotatedFromId }
  });
  console.log("Token berhasil dibuat. Simpan sekarang; secret tidak dapat ditampilkan ulang.");
  console.log(rawToken);
} finally {
  await prisma.$disconnect();
}
