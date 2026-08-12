import { prisma } from "@/lib/db/prisma";
import { authenticateMjRequest } from "@/lib/integrations/mj/auth";
import { MjIntegrationError, mjErrorResponse } from "@/lib/integrations/mj/errors";

export async function GET(request: Request) {
  try {
    await authenticateMjRequest(request, "read");
    const code = new URL(request.url).searchParams.get("bookkeeping_type_code")?.trim();
    if (!code) throw new MjIntegrationError("VALIDATION_FAILED", "bookkeeping_type_code wajib diisi.", 400);
    const tipe = await prisma.bookkeepingType.findFirst({ where: { code: { equals: code, mode: "insensitive" }, isActive: true } });
    if (!tipe) throw new MjIntegrationError("VALIDATION_FAILED", "Tipe pembukuan tidak ditemukan atau tidak aktif.", 400);
    const rows = await prisma.rekeningAccount.findMany({ where: { isActive: true, tipeLinks: { some: { bookkeepingTypeId: tipe.id } } }, orderBy: { name: "asc" } });
    return Response.json({ success: true, data: rows.map((row) => ({ reference: row.id, name: row.name, bank_name: row.bankName, account_number: row.accountNumber, aj_compatible: Boolean(row.erpCoaId) })) });
  } catch (error) { return mjErrorResponse(error); }
}
