import { NextRequest, NextResponse } from "next/server";
import { CCTV_BASE_URL, CCTV_TOKEN } from "@/lib/cctv/client";
import { getCurrentRole } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> }
) {
  // Autentikasi: pastikan user terautentikasi (atau token internal)
  const role = await getCurrentRole();
  const tokenHeader = req.headers.get("x-cctv-token");
  if (role === "UNAUTHENTICATED" && tokenHeader !== CCTV_TOKEN) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { cameraId } = await params;
  const cleanId = cameraId.replace(/^cam-?/i, "");
  const baseClean = CCTV_BASE_URL.replace(/\/+$/, "");

  // Tentukan target URL upstream kamera
  let targetUrl =
    process.env[`CCTV_STREAM_URL_CAM${cleanId}`] ||
    `${baseClean}/cameras/${encodeURIComponent(cleanId)}/stream`;

  // Hubungkan abort signal client ke upstream agar tidak terjadi connection leak saat tab ditutup
  const controller = new AbortController();
  req.signal.addEventListener("abort", () => {
    controller.abort();
  });

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        Authorization: `Bearer ${CCTV_TOKEN}`,
        "X-CCTV-Token": CCTV_TOKEN,
        Accept: "*/*",
      },
      signal: controller.signal,
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        {
          error: `Kamera ${cameraId} offline (upstream HTTP ${upstream.status}).`,
          isOnline: false,
        },
        { status: upstream.status === 404 ? 404 : 503 }
      );
    }

    const contentType =
      upstream.headers.get("content-type") ||
      "multipart/x-mixed-replace; boundary=frame";

    return new NextResponse(upstream.body as any, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        Connection: "keep-alive",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return new NextResponse(null, { status: 499 });
    }

    console.warn(
      `[CCTV Stream Relay Error] Gagal relay kamera ${cameraId} dari ${targetUrl}:`,
      error?.message
    );

    return NextResponse.json(
      {
        error: `Gagal menghubungkan ke feed video kamera ${cameraId}.`,
        isOnline: false,
      },
      { status: 503 }
    );
  }
}
