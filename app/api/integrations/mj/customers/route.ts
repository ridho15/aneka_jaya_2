import { authenticateMjRequest } from "@/lib/integrations/mj/auth";
import { MjIntegrationError, mjErrorResponse } from "@/lib/integrations/mj/errors";
import { listMjErpCustomers } from "@/lib/integrations/mj/erp";

export async function GET(request: Request) {
  try {
    await authenticateMjRequest(request, "read");
    const search = new URL(request.url).searchParams.get("search")?.trim() || "";
    const response = await listMjErpCustomers(search);
    if (!response.success) throw new MjIntegrationError(response.code === "ERP_TIMEOUT" ? "AJ_TIMEOUT" : "AJ_UPSTREAM_ERROR", response.message, response.code === "ERP_TIMEOUT" ? 504 : 502, response.details, true);
    return Response.json({ success: true, data: response.data });
  } catch (error) { return mjErrorResponse(error); }
}
