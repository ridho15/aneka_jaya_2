import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit/store";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const CCTV_TOKEN = process.env.CCTV_INTEGRATION_TOKEN || "cctv-slm-token-2026";

function verifyToken(request: Request): boolean {
  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return false;
  return match[1] === CCTV_TOKEN;
}

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

function isValidImageBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 12) return false;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return true;
  // WEBP: RIFF....WEBP
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return true;
  return false;
}

async function saveScreenshotFile(rawFile: unknown): Promise<string | null> {
  if (!rawFile || typeof rawFile !== "object" || !("arrayBuffer" in rawFile)) {
    return null;
  }

  const file = rawFile as File;
  if (typeof file.size === "number" && (file.size === 0 || file.size > 10 * 1024 * 1024)) {
    return null;
  }

  const mimeType = (file.type || "").toLowerCase();
  const fileExtFromMime = ALLOWED_MIME_TYPES[mimeType];
  const fileExtFromName = path.extname(file.name || "").toLowerCase();

  // Validasi ketat: tolak berkas non-gambar (misal .php, .sh, .html, .svg)
  if (!fileExtFromMime && (!fileExtFromName || ![".jpg", ".jpeg", ".png", ".webp"].includes(fileExtFromName))) {
    return null;
  }

  const ext = fileExtFromMime || (fileExtFromName && [".jpg", ".jpeg", ".png", ".webp"].includes(fileExtFromName) ? fileExtFromName : ".jpg");

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!isValidImageBuffer(buffer)) {
      return null;
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", "receipts");
    await mkdir(uploadDir, { recursive: true });

    const uniqueId = crypto.randomUUID().slice(0, 8);
    const filename = `cctv-pack-${Date.now()}-${uniqueId}${ext}`;
    const filePath = path.join(uploadDir, filename);

    await writeFile(filePath, buffer);

    return `/uploads/receipts/${filename}`;
  } catch {
    return null;
  }
}

async function saveBase64Screenshot(raw: unknown): Promise<string | null> {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const match = raw.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
  let ext = ".jpg";
  let dataStr = raw.trim();
  if (match) {
    ext = match[1].toLowerCase() === "png" ? ".png" : match[1].toLowerCase() === "webp" ? ".webp" : ".jpg";
    dataStr = match[2];
  } else if (!dataStr.startsWith("/uploads/") && !dataStr.startsWith("http://") && !dataStr.startsWith("https://") && dataStr.length > 100) {
    // String raw base64 tanpa prefix data:image
    ext = ".jpg";
  } else {
    // Bukan format base64
    return null;
  }

  if (dataStr.length > 15 * 1024 * 1024) return null; // Cegah OOM dari string terlampau besar
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(dataStr.trim())) return null; // Validasi karakter base64

  try {
    const buffer = Buffer.from(dataStr, "base64");
    if (!isValidImageBuffer(buffer)) {
      return null;
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", "receipts");
    await mkdir(uploadDir, { recursive: true });
    const uniqueId = crypto.randomUUID().slice(0, 8);
    const filename = `cctv-pack-${Date.now()}-${uniqueId}${ext}`;
    await writeFile(path.join(uploadDir, filename), buffer);
    return `/uploads/receipts/${filename}`;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!verifyToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    let cctv_label_id: any;
    let invoice_number: any;
    let customer_name: any;
    let source_label: any;
    let slm_reference: any;
    let event_type: any;
    let packing_completed_at: any;
    let evidence_url: any;

    let uploadedScreenshotUrl: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      cctv_label_id = formData.get("cctv_label_id");
      invoice_number = formData.get("invoice_number");
      customer_name = formData.get("customer_name");
      source_label = formData.get("source_label");
      slm_reference = formData.get("slm_reference");
      event_type = formData.get("event_type");
      packing_completed_at = formData.get("packing_completed_at");
      evidence_url = formData.get("evidence_url");

      const fileField = formData.get("screenshot") || formData.get("photo") || formData.get("file") || formData.get("image");
      if (fileField) {
        uploadedScreenshotUrl = await saveScreenshotFile(fileField);
      }
    } else {
      const body = await request.json().catch(() => ({}));
      cctv_label_id = body.cctv_label_id;
      invoice_number = body.invoice_number;
      customer_name = body.customer_name;
      source_label = body.source_label;
      slm_reference = body.slm_reference;
      event_type = body.event_type;
      packing_completed_at = body.packing_completed_at;
      evidence_url = body.evidence_url;

      if (body.screenshot || body.screenshot_base64) {
        uploadedScreenshotUrl = await saveBase64Screenshot(body.screenshot || body.screenshot_base64);
      }
    }

    const cleanInvoice = typeof invoice_number === "string" ? invoice_number.trim() : (invoice_number ? String(invoice_number).trim() : "");
    const cleanRef = typeof slm_reference === "string" ? slm_reference.trim() : (slm_reference ? String(slm_reference).trim() : "");

    if (!cleanInvoice && !cleanRef) {
      return NextResponse.json({ error: "invoice_number or slm_reference is required" }, { status: 400 });
    }

    // Cari SalesRecord
    const sales = await prisma.salesRecord.findFirst({
      where: {
        OR: [
          ...(cleanRef ? [{ id: cleanRef }] : []),
          ...(cleanInvoice ? [
            { transactionNumber: cleanInvoice },
            { id: cleanInvoice }
          ] : [])
        ]
      },
      include: {
        deliveryOrder: true
      }
    });

    if (!sales) {
      return NextResponse.json({
        error: "Sales record not found",
        saved: false
      }, { status: 404 });
    }

    const isPacked = event_type === "packing_completed" || Boolean(packing_completed_at);
    let packedDate = new Date();
    if (packing_completed_at) {
      const parsed = new Date(String(packing_completed_at));
      if (!isNaN(parsed.getTime())) {
        packedDate = parsed;
      }
    }

    // Prioritaskan file foto yang tersimpan lokal di ERP, lalu fallback ke evidence_url
    const resolvedPhotoUrl = uploadedScreenshotUrl
      || (evidence_url ? String(evidence_url) : null)
      || sales.deliveryOrder?.receiptPhotoUrl
      || null;

    // Update Delivery Order jika ada
    if (sales.deliveryOrder) {
      const beforeDO = {
        packingStatus: sales.deliveryOrder.packingStatus,
        packedAt: sales.deliveryOrder.packedAt,
        packedByNameSnapshot: sales.deliveryOrder.packedByNameSnapshot,
      };

      await prisma.deliveryOrder.update({
        where: { id: sales.deliveryOrder.id },
        data: {
          packingStatus: isPacked ? "sudah" : sales.deliveryOrder.packingStatus,
          packedAt: isPacked ? (sales.deliveryOrder.packedAt || packedDate) : sales.deliveryOrder.packedAt,
          packedByNameSnapshot: isPacked ? (sales.deliveryOrder.packedByNameSnapshot || "CCTV Auto-Packing") : sales.deliveryOrder.packedByNameSnapshot,
          receiptPhotoUrl: resolvedPhotoUrl
        }
      });

      if (isPacked) {
        await prisma.auditLog.create({
          data: {
            id: crypto.randomUUID(),
            entityType: "delivery_order",
            entityId: sales.deliveryOrder.id,
            action: "cctv_packing_sync",
            beforeValue: beforeDO,
            afterValue: {
              packingStatus: "sudah",
              packedAt: packedDate,
              packedByNameSnapshot: "CCTV Auto-Packing",
              receiptPhotoUrl: resolvedPhotoUrl,
              cctvLabelId: cctv_label_id ? Number(cctv_label_id) : null,
              evidenceUrl: evidence_url ? String(evidence_url) : null,
            },
            userId: "integration:cctv",
            userNameSnapshot: "CCTV Auto-Packing",
            userRoleSnapshot: "OWNER",
            reason: cctv_label_id
              ? `Konfirmasi packing otomatis dari kamera CCTV (Label #${cctv_label_id})`
              : "Konfirmasi packing otomatis dari kamera CCTV"
          }
        });
      }

    }

    // Update status packing di SalesRecord
    if (isPacked) {
      await prisma.salesRecord.update({
        where: { id: sales.id },
        data: {
          doPackingStatus: "sudah"
        }
      });
    }

    return NextResponse.json({
      saved: true,
      sales_record_id: sales.id,
      packing_status: isPacked ? "sudah" : "belum",
      cctv_label_id,
      receipt_photo_url: resolvedPhotoUrl
    }, { status: 200 });

  } catch (error) {
    console.error("CCTV Sync Error:", error);
    return NextResponse.json({
      error: "Internal Server Error",
      saved: false,
      message: error instanceof Error ? error.message : "Terjadi kesalahan internal"
    }, { status: 500 });
  }
}
