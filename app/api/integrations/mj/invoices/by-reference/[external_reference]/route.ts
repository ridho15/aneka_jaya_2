import { authenticateMjRequest } from "@/lib/integrations/mj/auth";
import { mjErrorResponse } from "@/lib/integrations/mj/errors";
import { findMjInvoice, invoiceSnapshotWithTempo } from "@/lib/integrations/mj/service";

export async function GET(request: Request, { params }: { params: Promise<{ external_reference: string }> }) {
  try {
    await authenticateMjRequest(request, "read");
    const { external_reference } = await params;
    return Response.json({ success: true, data: await invoiceSnapshotWithTempo(await findMjInvoice(external_reference)) });
  } catch (error) { return mjErrorResponse(error); }
}
