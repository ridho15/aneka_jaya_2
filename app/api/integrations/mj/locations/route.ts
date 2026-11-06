import { authenticateMjRequest } from "@/lib/integrations/mj/auth";
import { MjIntegrationError, mjErrorResponse } from "@/lib/integrations/mj/errors";
import { listLocations } from "@/lib/inventory/service";

export async function GET(request: Request) {
  try {
    await authenticateMjRequest(request, "read");
    const { searchParams } = new URL(request.url);
    const rawType = searchParams.get("type")?.trim().toUpperCase();
    if (rawType && rawType !== "WAREHOUSE" && rawType !== "STORE") {
      throw new MjIntegrationError("VALIDATION_FAILED", "Query param type harus bernilai WAREHOUSE atau STORE.", 400);
    }
    const type = rawType === "WAREHOUSE" || rawType === "STORE" ? rawType : undefined;
    const includeInactive = searchParams.get("include_inactive") === "true";

    const data = await listLocations({ type, includeInactive });
    return Response.json({ success: true, data });
  } catch (error) {
    return mjErrorResponse(error);
  }
}
