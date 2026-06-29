import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const requiredModels = {
  User: "user",
  AuditLog: "auditLog",
  ApprovalRequest: "approvalRequest",
  TempoReceivable: "tempoReceivable",
  TempoPayment: "tempoPayment",
  SalesRecord: "salesRecord",
  SalesRecordItem: "salesRecordItem",
  BookkeepingType: "bookkeepingType",
  RekeningAccount: "rekeningAccount",
  RekeningAccountBookkeepingType: "rekeningAccountBookkeepingType",
  WhatsAppRecipient: "whatsAppRecipient",
  WhatsAppMessageLog: "whatsAppMessageLog",
  StockAlertLog: "stockAlertLog"
};

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL wajib diisi untuk verifikasi database.");
  await prisma.$queryRaw`SELECT 1`;

  const result = {};
  for (const [tableName, modelName] of Object.entries(requiredModels)) {
    try {
      result[tableName] = await prisma[modelName].count();
    } catch (error) {
      throw new Error(`Tabel/model ${tableName} tidak siap. Jalankan npm run db:migrate:deploy terlebih dulu. Detail: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(JSON.stringify({ ok: true, tables: result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
