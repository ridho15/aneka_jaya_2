import { authenticateMjRequest } from "@/lib/integrations/mj/auth";
import { MjIntegrationError, mjErrorResponse } from "@/lib/integrations/mj/errors";

export async function POST(request: Request) {
  try {
    await authenticateMjRequest(request, "mutation");
    throw new MjIntegrationError("AJ_CONTRACT_PENDING", "Kontrak cancel/reversal AJ belum tersedia; status lokal tidak diubah.", 501, undefined, false);
  } catch (error) { return mjErrorResponse(error); }
}
