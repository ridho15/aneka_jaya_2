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

    if (!invoice_number || typeof invoice_number !== "string") {
      return NextResponse.json({ error: "invoice_number is required" }, { status: 400 });
    }

    const trimmedInvoice = invoice_number.trim();

    // Cari SalesRecord berdasarkan transactionNumber atau ID
    const sales = await prisma.salesRecord.findFirst({
      where: {
        OR: [
          { transactionNumber: trimmedInvoice },
          { id: trimmedInvoice },
          { transactionNumber: { contains: trimmedInvoice, mode: "insensitive" } }
        ]
      },
      include: {
        deliveryOrder: true
      }
    });

    if (!sales) {
      return NextResponse.json({
        matched: false,
        reference: null
      }, { status: 200 });
    }

    // Jika customer_name diberikan, periksa kecocokan customer
    if (customer_name && typeof customer_name === "string" && customer_name.trim()) {
      const targetCustomer = customer_name.trim().toLowerCase();
      const actualCustomer = (sales.customerName || "").trim().toLowerCase();
      const isMatch = actualCustomer.includes(targetCustomer) || targetCustomer.includes(actualCustomer);
      if (!isMatch) {
        // Customer berbeda
        return NextResponse.json({
          matched: false,
          reference: null,
          note: `Customer tidak cocok: terbaca '${customer_name}', aktual '${sales.customerName}'`
        }, { status: 200 });
      }
    }

    return NextResponse.json({
      matched: true,
      reference: sales.id,
      invoice_number: sales.transactionNumber || sales.id,
      customer_name: sales.customerName,
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
