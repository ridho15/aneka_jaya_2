import { authenticateMjRequest } from "@/lib/integrations/mj/auth";
import { MjIntegrationError, mjErrorResponse } from "@/lib/integrations/mj/errors";
import { createOrResumeMjInvoice } from "@/lib/integrations/mj/service";
import { mjInvoiceSchema } from "@/lib/integrations/mj/validation";

export async function POST(request: Request) {
  try {
    const principal = await authenticateMjRequest(request, "mutation");
    const parsed = mjInvoiceSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new MjIntegrationError("VALIDATION_FAILED", "Payload invoice tidak valid.", 400, parsed.error.flatten());
    const result = await createOrResumeMjInvoice(parsed.data, principal);
    return Response.json({ success: true, data: result }, { status: result.status === "created" ? 201 : 200 });
  } catch (error) { return mjErrorResponse(error); }
}
