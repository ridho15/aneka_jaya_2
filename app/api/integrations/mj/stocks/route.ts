import { authenticateMjRequest } from "@/lib/integrations/mj/auth";
import { mjErrorResponse } from "@/lib/integrations/mj/errors";
import { listLocalStockItems } from "@/lib/inventory/legacyAdapter";

export async function GET(request: Request) {
  try {
    await authenticateMjRequest(request, "read");
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get("keyword")?.trim() || searchParams.get("search")?.trim() || undefined;
    const sku = searchParams.get("sku")?.trim() || undefined;
    const warehouse = searchParams.get("warehouse")?.trim() || undefined;
    const productId = searchParams.get("product_id")?.trim() || searchParams.get("productId")?.trim() || undefined;

    const data = await listLocalStockItems({ keyword, sku, warehouse, productId });
    return Response.json({ success: true, data });
  } catch (error) {
    return mjErrorResponse(error);
  }
}
