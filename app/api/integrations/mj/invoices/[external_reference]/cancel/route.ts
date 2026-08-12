import { authenticateMjRequest } from "@/lib/integrations/mj/auth";
import { MjIntegrationError, mjErrorResponse } from "@/lib/integrations/mj/errors";
import { cancelMjInvoice, findMjInvoice } from "@/lib/integrations/mj/service";
import { mjCancelSchema } from "@/lib/integrations/mj/validation";

export async function POST(request: Request, { params }: { params: Promise<{ external_reference: string }> }) {
  try {
    const principal = await authenticateMjRequest(request, "mutation");
    const parsed = mjCancelSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new MjIntegrationError("VALIDATION_FAILED", "Alasan cancel wajib diisi.", 400, parsed.error.flatten());
    const { external_reference } = await params;
    return Response.json({ success: true, data: await cancelMjInvoice(await findMjInvoice(external_reference), parsed.data.reason, principal) });
  } catch (error) { return mjErrorResponse(error); }
}
