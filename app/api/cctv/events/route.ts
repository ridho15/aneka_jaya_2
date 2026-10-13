import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import crypto from "node:crypto";

const CCTV_TOKEN =
  process.env.SLM_API_TOKEN ||
  process.env.CCTV_API_TOKEN ||
  process.env.CCTV_INTEGRATION_TOKEN ||
  "cctv_slm_8e119688c48b1880da69c9ab632b6c415ddc5f4d94467ea50305b951c5a0d04b";

function verifyToken(request: Request, rawBody?: string): boolean {
  // 1. Cek Header X-CCTV-Token
  const customHeader = request.headers.get("x-cctv-token");
  if (customHeader && customHeader === CCTV_TOKEN) {
    return true;
  }

  // 2. Cek Header Authorization: Bearer <token>
  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+([^\s]+)$/i);
  if (match && match[1] === CCTV_TOKEN) {
    return true;
  }

  // 3. Cek Opsional HMAC-SHA256 Signature jika ada
  const signatureHeader = request.headers.get("x-cctv-signature");
  if (signatureHeader && rawBody) {
    try {
      const expectedSig =
        "sha256=" +
        crypto.createHmac("sha256", CCTV_TOKEN).update(rawBody).digest("hex");
      const sigBuf = Buffer.from(signatureHeader);
      const expBuf = Buffer.from(expectedSig);
      if (
        sigBuf.length === expBuf.length &&
        crypto.timingSafeEqual(sigBuf, expBuf)
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

export interface CctvWebhookPayload {
  event_id?: string;
  event_type: "packing_completed" | "anomaly" | "camera_offline" | "desk_empty" | string;
  severity?: "info" | "warning" | "critical" | string;
  title?: string;
  message?: string;
  occurred_at?: string;
  evidence_url?: string;
  clip_url?: string;
  camera?: {
    id?: number | string;
    name?: string;
    location?: string;
  };
  data?: {
    label_id?: number | string;
    incident_id?: number | string;
    invoice_number?: string;
    customer_name?: string;
    source_label?: string;
    slm_reference?: string;
    packing_completed_at?: string;
    evidence_url?: string;
    clip_url?: string;
    [key: string]: unknown;
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text().catch(() => "");
  if (!verifyToken(request, rawBody)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: CctvWebhookPayload;
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON format in request body" },
      { status: 400 }
    );
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !payload.event_type ||
    typeof payload.event_type !== "string" ||
    !payload.event_type.trim()
  ) {
    return NextResponse.json(
      { error: "Invalid payload: event_type is required" },
      { status: 400 }
    );
  }

  try {

    const { event_id, event_type, severity, title, message, occurred_at, camera, data } = payload;
    const eventTime = occurred_at ? new Date(occurred_at) : new Date();
    const safeEventTime = isNaN(eventTime.getTime()) ? new Date() : eventTime;

    switch (event_type) {
      case "packing_completed": {
        const invoiceNumber = data?.invoice_number ? String(data.invoice_number).trim() : "";
        const slmReference = data?.slm_reference ? String(data.slm_reference).trim() : "";

        if (invoiceNumber || slmReference) {
          const sales = await prisma.salesRecord.findFirst({
            where: {
              OR: [
                ...(slmReference ? [{ id: slmReference }] : []),
                ...(invoiceNumber
                  ? [{ transactionNumber: invoiceNumber }, { id: invoiceNumber }]
                  : []),
              ],
            },
            include: { deliveryOrder: true },
          });

          const packedDate = data?.packing_completed_at
            ? new Date(String(data.packing_completed_at))
            : safeEventTime;
          const safePackedDate = isNaN(packedDate.getTime()) ? safeEventTime : packedDate;

          if (sales) {
            // 1. Update status packing di SalesRecord
            await prisma.salesRecord.update({
              where: { id: sales.id },
              data: { doPackingStatus: "sudah" },
            });

            // 2. Update DeliveryOrder jika ada
            if (sales.deliveryOrder) {
              await prisma.deliveryOrder.update({
                where: { id: sales.deliveryOrder.id },
                data: {
                  packingStatus: "sudah",
                  packedAt: sales.deliveryOrder.packedAt || safePackedDate,
                  packedByNameSnapshot:
                    sales.deliveryOrder.packedByNameSnapshot || "CCTV Auto-Packing",
                },
              });
            }

            // 3. Catat di AuditLog
            await prisma.auditLog.create({
              data: {
                id: crypto.randomUUID(),
                entityType: sales.deliveryOrder ? "delivery_order" : "sales",
                entityId: sales.deliveryOrder ? sales.deliveryOrder.id : sales.id,
                action: "cctv_packing_sync",
                userId: "integration:cctv",
                userNameSnapshot: "CCTV Auto-Packing",
                userRoleSnapshot: "OWNER",
                reason:
                  message ||
                  title ||
                  `Packing selesai terdeteksi otomatis oleh CCTV (Invoice #${invoiceNumber || sales.id})`,
                afterValue: {
                  event_id,
                  event_type,
                  invoice_number: invoiceNumber,
                  customer_name: data?.customer_name || sales.customerName,
                  camera,
                  packed_at: safePackedDate,
                  cctv_label_id: data?.label_id,
                  evidence_url:
                    data?.evidence_url ? String(data.evidence_url) :
                    payload.evidence_url ? String(payload.evidence_url) : null,
                },
              },
            });
          }

          const resolvedEvidenceUrl =
            data?.evidence_url ? String(data.evidence_url) :
            payload.evidence_url ? String(payload.evidence_url) : null;

          // 4. Catat di tabel CctvDetectionLog (Dedicated Logging)
          await prisma.cctvDetectionLog.create({
            data: {
              cctvLabelId: data?.label_id ? Number(data.label_id) : null,
              invoiceNumber: invoiceNumber || null,
              customerName: data?.customer_name || sales?.customerName || null,
              sourceLabel: data?.source_label ? String(data.source_label) : null,
              slmReference: slmReference || (sales ? sales.id : null),
              salesRecordId: sales ? sales.id : null,
              deliveryOrderId: sales?.deliveryOrder ? sales.deliveryOrder.id : null,
              cameraId: camera?.id ? Number(camera.id) : null,
              cameraName: camera?.name || null,
              cameraLocation: camera?.location || null,
              eventType: "packing_completed",
              severity: severity || "info",
              packingStatus: "completed",
              matchStatus: sales ? "matched" : "unmatched",
              firstSeenAt: safeEventTime,
              packingCompletedAt: safePackedDate,
              evidenceUrl: resolvedEvidenceUrl,
              screenshotPhotoUrl: resolvedEvidenceUrl,
              rawPayload: payload as any,
              notes:
                message ||
                title ||
                `Packing selesai di ${camera?.name || "Kamera CCTV"}`,
            },
          });
        }
        break;
      }

      case "anomaly": {
        const resolvedEvidenceUrl =
          data?.evidence_url ? String(data.evidence_url) :
          payload.evidence_url ? String(payload.evidence_url) : null;
        const resolvedClipUrl =
          data?.clip_url ? String(data.clip_url) :
          payload.clip_url ? String(payload.clip_url) : null;

        // Catat insiden anomali (barang keluar jalur packing / indikasi kehilangan)
        await prisma.auditLog.create({
          data: {
            id: crypto.randomUUID(),
            entityType: "cctv_incident",
            entityId: event_id || `anomaly-${Date.now()}`,
            action: "cctv_anomaly_alert",
            userId: "integration:cctv",
            userNameSnapshot: "CCTV Security AI",
            userRoleSnapshot: "OWNER",
            reason: title ? `${title}: ${message || ""}` : (message || "Anomali terdeteksi di area packing CCTV"),
            afterValue: {
              event_id,
              severity: severity || "critical",
              camera,
              occurred_at: safeEventTime,
              incident_id: data?.incident_id,
              reason: data?.reason || message || title,
              item_count: data?.item_count,
              evidence_url: resolvedEvidenceUrl,
              clip_url: resolvedClipUrl,
              data: data || null,
            } as any,
          },
        });

        await prisma.cctvDetectionLog.create({
          data: {
            cctvLabelId: data?.label_id ? Number(data.label_id) : (data?.incident_id ? Number(data.incident_id) : null),
            invoiceNumber: data?.invoice_number ? String(data.invoice_number) : null,
            customerName: data?.customer_name ? String(data.customer_name) : null,
            sourceLabel: data?.source_label ? String(data.source_label) : null,
            cameraId: camera?.id ? Number(camera.id) : null,
            cameraName: camera?.name || null,
            cameraLocation: camera?.location || null,
            eventType: "anomaly",
            severity: severity || "critical",
            packingStatus: "anomaly",
            matchStatus: "review",
            firstSeenAt: safeEventTime,
            evidenceUrl: resolvedEvidenceUrl,
            rawPayload: payload as any,
            notes: (data?.reason as string) || message || title || "Anomali terdeteksi di area packing CCTV",
          },
        });
        break;
      }

      case "camera_offline": {
        // Catat insiden kamera terputus
        await prisma.auditLog.create({
          data: {
            id: crypto.randomUUID(),
            entityType: "cctv_camera",
            entityId: camera?.name || (camera?.id ? String(camera.id) : "camera"),
            action: "cctv_camera_offline",
            userId: "integration:cctv",
            userNameSnapshot: "CCTV Health Monitor",
            userRoleSnapshot: "OWNER",
            reason: title ? `${title}: ${message || ""}` : (message || "Kamera CCTV terputus atau offline"),
            afterValue: {
              event_id,
              severity: severity || "warning",
              camera,
              occurred_at: safeEventTime,
            },
          },
        });

        await prisma.cctvDetectionLog.create({
          data: {
            cameraId: camera?.id ? Number(camera.id) : null,
            cameraName: camera?.name || null,
            cameraLocation: camera?.location || null,
            eventType: "camera_offline",
            severity: severity || "warning",
            packingStatus: "camera_offline",
            matchStatus: "review",
            firstSeenAt: safeEventTime,
            rawPayload: payload as any,
            notes: message || title || "Kamera CCTV terputus atau offline",
          },
        });
        break;
      }

      case "desk_empty": {
        // Catat meja packing kosong melampaui batas toleransi
        await prisma.auditLog.create({
          data: {
            id: crypto.randomUUID(),
            entityType: "cctv_desk",
            entityId: camera?.name || (camera?.id ? String(camera.id) : "desk"),
            action: "cctv_desk_empty",
            userId: "integration:cctv",
            userNameSnapshot: "CCTV Productivity Monitor",
            userRoleSnapshot: "OWNER",
            reason: title ? `${title}: ${message || ""}` : (message || "Petugas meja packing tidak terdeteksi"),
            afterValue: {
              event_id,
              severity: severity || "warning",
              camera,
              occurred_at: safeEventTime,
            },
          },
        });

        await prisma.cctvDetectionLog.create({
          data: {
            cameraId: camera?.id ? Number(camera.id) : null,
            cameraName: camera?.name || null,
            cameraLocation: camera?.location || null,
            eventType: "desk_empty",
            severity: severity || "warning",
            packingStatus: "desk_empty",
            matchStatus: "review",
            firstSeenAt: safeEventTime,
            rawPayload: payload as any,
            notes: message || title || "Petugas meja packing tidak terdeteksi",
          },
        });
        break;
      }

      default: {
        // Event tipe lain (misal custom event)
        await prisma.auditLog.create({
          data: {
            id: crypto.randomUUID(),
            entityType: "cctv_event",
            entityId: event_id || `event-${Date.now()}`,
            action: "cctv_generic_event",
            userId: "integration:cctv",
            userNameSnapshot: "CCTV System",
            userRoleSnapshot: "OWNER",
            reason: title ? `${title}: ${message || ""}` : (message || `Event CCTV: ${event_type}`),
            afterValue: {
              event_id,
              event_type,
              severity,
              camera,
              data: data || null,
            } as any,
          },
        });
        break;
      }
    }

    return NextResponse.json(
      { status: "ok", received_id: event_id || null, event_type },
      { status: 200 }
    );
  } catch (error) {
    console.error("CCTV Events Webhook Error:", error);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Terjadi kesalahan internal",
      },
      { status: 500 }
    );
  }
}
