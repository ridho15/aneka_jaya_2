import { createRequire } from "node:module";
const require = createRequire("/Users/lrmcorporation/Documents/Website/SLM/package.json");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function jakartaDateKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
}

async function main() {
  const todayStr = jakartaDateKey();
  console.log("Today in Jakarta:", todayStr);

  const tempoRows = await prisma.tempoReceivable.findMany({
    orderBy: { dueDate: "asc" }
  });

  console.log("Total tempo records in DB:", tempoRows.length);

  // Group by status
  const byStatus = {};
  for (const r of tempoRows) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  }
  console.log("By DB status:", byStatus);

  const finalStatuses = ["paid", "cancelled", "written_off"];
  const openRows = tempoRows.filter(r => !finalStatuses.includes(r.status));
  console.log("\n--- ACTIVE / OPEN TEMPO RECORDS (Total:", openRows.length, ") ---");

  let totalOpenAmount = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  let comingSoonH3Count = 0;
  let comingSoonH3Amount = 0;
  let laterCount = 0;
  let laterAmount = 0;

  const todayObj = new Date(todayStr + "T00:00:00+07:00");
  const h3Obj = new Date(todayObj);
  h3Obj.setDate(h3Obj.getDate() + 3);
  const h3Str = jakartaDateKey(h3Obj);

  console.log(`Bucket criteria based on today (${todayStr}):`);
  console.log(`- Overdue: dueDate < ${todayStr}`);
  console.log(`- Coming Soon (H-3): dueDate >= ${todayStr} AND dueDate <= ${h3Str}`);
  console.log(`- Di Luar Itu (> H-3): dueDate > ${h3Str}`);

  for (const r of openRows) {
    const dueStr = jakartaDateKey(r.dueDate);
    const rem = Number(r.remainingAmount) || 0;
    totalOpenAmount += rem;

    const diffDays = Math.round((new Date(dueStr).getTime() - new Date(todayStr).getTime()) / (1000 * 60 * 60 * 24));

    let bucket = "";
    if (dueStr < todayStr) {
      overdueCount++;
      overdueAmount += rem;
      bucket = "OVERDUE (lewat tempo)";
    } else if (dueStr <= h3Str) {
      comingSoonH3Count++;
      comingSoonH3Amount += rem;
      bucket = `COMING SOON H-3 (H+${diffDays})`;
    } else {
      laterCount++;
      laterAmount += rem;
      bucket = `DI LUAR ITU (H+${diffDays})`;
    }

    console.log(`[${r.id}] ${r.customerName.padEnd(22)} | Due: ${dueStr} (diff: ${diffDays}d) | Rem: Rp ${rem.toLocaleString("id-ID")} | Bucket: ${bucket}`);
  }

  console.log("\n=== REKAPITULASI BUCKET TEMPO ===");
  console.log("1. Total Tempo Aktif :", openRows.length, "nota | Rp", totalOpenAmount.toLocaleString("id-ID"));
  console.log("2. Overdue (Lewat)   :", overdueCount, "nota | Rp", overdueAmount.toLocaleString("id-ID"));
  console.log("3. Coming Soon (H-3) :", comingSoonH3Count, "nota | Rp", comingSoonH3Amount.toLocaleString("id-ID"));
  console.log("4. Di Luar Itu (>H-3):", laterCount, "nota | Rp", laterAmount.toLocaleString("id-ID"));
  console.log("Check sum count:", overdueCount + comingSoonH3Count + laterCount, "===", openRows.length);
  console.log("Check sum amount:", overdueAmount + comingSoonH3Amount + laterAmount, "===", totalOpenAmount);
}

main().catch(console.error).finally(() => prisma.$disconnect());
