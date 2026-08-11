import { authenticateMjRequest } from "@/lib/integrations/mj/auth";
import { MjIntegrationError, mjErrorResponse } from "@/lib/integrations/mj/errors";
import { findMjInvoice, recordMjTempoPayment } from "@/lib/integrations/mj/service";
import { mjTempoPaymentSchema } from "@/lib/integrations/mj/validation";

export async function POST(request: Request, { params }: { params: Promise<{ external_reference: string }> }) {
  try {
    await authenticateMjRequest(request, "mutation");
    const parsed = mjTempoPaymentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new MjIntegrationError("VALIDATION_FAILED", "Payload pembayaran tidak valid.", 400, parsed.error.flatten());
    const { external_reference } = await params;
    const result = await recordMjTempoPayment(await findMjInvoice(external_reference), parsed.data);
    return Response.json({ success: true, data: result }, { status: result.status === "created" ? 201 : 200 });
  } catch (error) { return mjErrorResponse(error); }
}
