import { authenticateMjRequest } from "@/lib/integrations/mj/auth";
import { MjIntegrationError, mjErrorResponse } from "@/lib/integrations/mj/errors";
import { findMjInvoice, recordMjPrintEvent } from "@/lib/integrations/mj/service";
import { mjPrintEventSchema } from "@/lib/integrations/mj/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ external_reference: string }> }
) {
  try {
    const principal = await authenticateMjRequest(request, "mutation");
    const body = await request.json().catch(() => ({}));
    const parsed = mjPrintEventSchema.safeParse(body);
    if (!parsed.success) {
      throw new MjIntegrationError(
        "VALIDATION_FAILED",
        "Payload print event tidak valid.",
        400,
        parsed.error.flatten()
      );
    }
    const { external_reference } = await params;
    const row = await findMjInvoice(external_reference);
    const result = await recordMjPrintEvent(row, parsed.data, principal);
    return Response.json({ success: true, data: result }, { status: 200 });
  } catch (error) {
    return mjErrorResponse(error);
  }
}
