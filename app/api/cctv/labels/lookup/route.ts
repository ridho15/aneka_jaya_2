import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

const CCTV_TOKEN = process.env.CCTV_INTEGRATION_TOKEN || "cctv-slm-token-2026";

function verifyToken(request: Request): boolean {
  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return false;
  return match[1] === CCTV_TOKEN;
}

export async function POST(request: Request) {
  if (!verifyToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { invoice_number, customer_name, source_label, integration_marker } = body;

    if (!invoice_number || typeof invoice_number !== "string" || !invoice_number.trim()) {
      return NextResponse.json({ error: "invoice_number is required" }, { status: 400 });
    }

    const trimmedInvoice = invoice_number.trim();

    // 1. Cari SalesRecord: prioritaskan exact match terlebih dahulu
    let sales = await prisma.salesRecord.findFirst({
      where: {
        OR: [
          { transactionNumber: trimmedInvoice },
          { id: trimmedInvoice }
        ]
      },
      include: {
        deliveryOrder: true
      }
    });

    // 2. Fallback pencarian substring hanya jika panjang invoice >= 4 karakter
    if (!sales && trimmedInvoice.length >= 4) {
      sales = await prisma.salesRecord.findFirst({
        where: {
          transactionNumber: { contains: trimmedInvoice, mode: "insensitive" }
        },
        include: {
          deliveryOrder: true
        }
      });
    }

    if (!sales) {
      return NextResponse.json({
        matched: false,
        reference: null
      }, { status: 200 });
    }

    // Periksa kecocokan customer secara lunak (informational, non-blocking)
    let customerMatched = true;
    let note: string | undefined = undefined;

    if (customer_name && typeof customer_name === "string" && customer_name.trim()) {
      const targetCustomer = customer_name.trim().toLowerCase();
      const actualCustomer = (sales.customerName || "").trim().toLowerCase();
      const isMatch = actualCustomer.includes(targetCustomer) || targetCustomer.includes(actualCustomer);
      customerMatched = isMatch;
      if (!isMatch) {
        note = `Customer OCR berbeda: terbaca '${customer_name.trim()}', aktual '${sales.customerName || "-"}'`;
      }
    }

    return NextResponse.json({
      matched: true,
      reference: sales.id,
      invoice_number: sales.transactionNumber || sales.id,
      customer_name: sales.customerName,
      customer_matched: customerMatched,
      ...(note ? { note } : {}),
      delivery_order_id: sales.deliveryOrder?.id || null,
      packing_status: sales.deliveryOrder?.packingStatus || sales.doPackingStatus || "belum"
    }, { status: 200 });

  } catch (error) {
    console.error("CCTV Lookup Error:", error);
    return NextResponse.json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Terjadi kesalahan internal"
    }, { status: 500 });
  }
}
