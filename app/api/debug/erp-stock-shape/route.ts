import { NextResponse } from "next/server";
import { anikaRequest } from "@/lib/api/anikaClient";
import { buildErpShape } from "@/lib/api/erpShapeAudit";
import { getCurrentRole } from "@/lib/auth/session";

function debugEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_APP_MODE !== "production";
}

export async function GET() {
  if (!debugEnabled()) return NextResponse.json({ success: false, message: "Debug ERP shape hanya tersedia di development." }, { status: 404 });
  if ((await getCurrentRole()) !== "OWNER") return NextResponse.json({ success: false, message: "Tidak punya akses debug ERP shape." }, { status: 403 });

  const [products, stocks] = await Promise.all([
    anikaRequest<unknown>("/products"),
    anikaRequest<unknown>("/stocks")
  ]);

  if (!products.success) return NextResponse.json(products, { status: 502 });
  if (!stocks.success) return NextResponse.json(stocks, { status: 502 });

  const data = {
    generatedAt: new Date().toISOString(),
    products: buildErpShape("products", products.data),
    stocks: buildErpShape("stocks", stocks.data)
  };

  console.info("[ERP shape audit]", JSON.stringify({ generatedAt: data.generatedAt, products: data.products.keys, stocks: data.stocks.keys }));
  return NextResponse.json({ success: true, data });
}
