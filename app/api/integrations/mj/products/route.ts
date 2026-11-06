import { authenticateMjRequest } from "@/lib/integrations/mj/auth";
import { mjErrorResponse } from "@/lib/integrations/mj/errors";
import { listProducts } from "@/lib/inventory/service";

export async function GET(request: Request) {
  try {
    await authenticateMjRequest(request, "read");
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get("keyword")?.trim() || searchParams.get("search")?.trim() || undefined;
    const rawPage = parseInt(searchParams.get("page") || "1", 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const rawSize = parseInt(searchParams.get("page_size") || searchParams.get("limit") || searchParams.get("pageSize") || "50", 10);
    const pageSize = Number.isFinite(rawSize) && rawSize > 0 ? Math.min(200, rawSize) : 50;
    const includeInactive = searchParams.get("include_inactive") === "true";

    const result = await listProducts({ keyword, page, pageSize, includeInactive });
    return Response.json({ success: true, data: result.data, meta: result.meta });
  } catch (error) {
    return mjErrorResponse(error);
  }
}
