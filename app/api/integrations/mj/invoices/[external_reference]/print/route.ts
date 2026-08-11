import { listAllRekeningAccounts } from "@/lib/business/masterData";
import { formatSaleDotMatrix, toEscPosPrn } from "@/lib/print/dotMatrix";
import { salesRekeningLabel } from "@/lib/sales/rekening";
import { getSalesRecord } from "@/lib/sales/store";
import { authenticateMjRequest } from "@/lib/integrations/mj/auth";
import { MjIntegrationError, mjErrorResponse } from "@/lib/integrations/mj/errors";
import { findMjInvoice } from "@/lib/integrations/mj/service";

export async function GET(request: Request, { params }: { params: Promise<{ external_reference: string }> }) {
  try {
    await authenticateMjRequest(request, "read");
    const { external_reference } = await params;
    const row = await findMjInvoice(external_reference);
    const sale = await getSalesRecord(row.id);
    if (!sale) throw new MjIntegrationError("VALIDATION_FAILED", "Invoice MJ tidak ditemukan.", 404);
    const rekeningNameSnapshot = salesRekeningLabel(sale, await listAllRekeningAccounts());
    const text = formatSaleDotMatrix({ ...sale, rekeningNameSnapshot }, { showTransactionNumber: true });
    const isPrn = new URL(request.url).searchParams.get("format") === "prn";
    return new Response(isPrn ? toEscPosPrn(text) : text, { headers: { "content-type": isPrn ? "application/octet-stream" : "text/plain; charset=utf-8", ...(isPrn ? { "content-disposition": `attachment; filename="mj-${external_reference}.prn"` } : {}) } });
  } catch (error) { return mjErrorResponse(error); }
}
