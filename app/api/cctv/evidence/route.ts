import { NextRequest, NextResponse } from "next/server";
import { CCTV_BASE_URL, CCTV_TOKEN, matchesToken } from "@/lib/cctv/client";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Daftar host yang diizinkan untuk diambil gambarnya (Proteksi SSRF)
 */
function isAllowedHost(hostname: string): boolean {
  const allowed = new Set([
    "localhost",
    "127.0.0.1",
    "cctvslm.playgo.id",
  ]);

  try {
    const configuredBaseHost = new URL(CCTV_BASE_URL).hostname;
    allowed.add(configuredBaseHost);
  } catch {
    // Ignore invalid base url parsing
  }

  return allowed.has(hostname.toLowerCase());
}

export async function GET(req: NextRequest) {
  // Autentikasi session: pastikan user terautentikasi (atau token internal valid)
  const user = await getCurrentUser();
  const tokenHeader = req.headers.get("x-cctv-token");
  const isTokenValid =
    matchesToken(tokenHeader) ||
    matchesToken(req.nextUrl.searchParams.get("token"));
  const isAuthenticated = user.id !== "unauthenticated";

  if (!isAuthenticated && !isTokenValid) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const labelId = searchParams.get("labelId");
  const urlParam = searchParams.get("url");

  if (!labelId && !urlParam) {
    return NextResponse.json(
      { error: "Parameter url atau labelId diperlukan." },
      { status: 400 }
    );
  }

  let upstreamUrl = "";
  const baseClean = CCTV_BASE_URL.replace(/\/+$/, "");

  if (labelId) {
    upstreamUrl = `${baseClean}/api/v1/slm/evidence/label-snapshot/${encodeURIComponent(
      labelId
    )}?token=${encodeURIComponent(CCTV_TOKEN)}`;
  } else if (urlParam) {
    const trimmed = urlParam.trim();

    // 1. Cek jika URL adalah path relatif lokal atau API
    if (trimmed.startsWith("/")) {
      const labelMatch = trimmed.match(/^\/labels\/(\d+)/i);
      if (labelMatch) {
        upstreamUrl = `${baseClean}/api/v1/slm/evidence/label-snapshot/${labelMatch[1]}?token=${encodeURIComponent(
          CCTV_TOKEN
        )}`;
      } else {
        upstreamUrl = `${baseClean}${trimmed}`;
        if (!upstreamUrl.includes("token=")) {
          upstreamUrl += `${trimmed.includes("?") ? "&" : "?"}token=${encodeURIComponent(CCTV_TOKEN)}`;
        }
      }
    } else {
      // 2. URL absolut
      try {
        const parsed = new URL(trimmed);

        if (!isAllowedHost(parsed.hostname)) {
          return NextResponse.json(
            { error: `Host '${parsed.hostname}' tidak diizinkan untuk diproxy.` },
            { status: 403 }
          );
        }

        // Jika URL merujuk ke /labels/{id}, rewrite ke endpoint image asli
        const labelMatch = parsed.pathname.match(/^\/labels\/(\d+)/i);
        if (labelMatch) {
          upstreamUrl = `${baseClean}/api/v1/slm/evidence/label-snapshot/${labelMatch[1]}?token=${encodeURIComponent(
            CCTV_TOKEN
          )}`;
        } else {
          // Ganti origin dengan CCTV_BASE_URL internal
          parsed.protocol = new URL(CCTV_BASE_URL).protocol;
          parsed.host = new URL(CCTV_BASE_URL).host;
          if (!parsed.searchParams.has("token")) {
            parsed.searchParams.set("token", CCTV_TOKEN);
          }
          upstreamUrl = parsed.toString();
        }
      } catch {
        return NextResponse.json(
          { error: "Format URL tidak valid." },
          { status: 400 }
        );
      }
    }
  }

  // Hanya endpoint bukti foto CCTV yang boleh diproxy (dicek setelah URL dinormalisasi, jadi ../ tidak lolos).
  let upstreamPath = "";
  try {
    upstreamPath = new URL(upstreamUrl).pathname;
  } catch {
    return NextResponse.json({ error: "Format URL tidak valid." }, { status: 400 });
  }
  if (!upstreamPath.startsWith("/api/v1/slm/evidence/")) {
    return NextResponse.json({ error: "Path CCTV ini tidak diizinkan untuk diproxy." }, { status: 403 });
  }

  try {
    const response = await fetch(upstreamUrl, {
      headers: {
        Authorization: `Bearer ${CCTV_TOKEN}`,
        "X-CCTV-Token": CCTV_TOKEN,
        Accept: "image/*, */*",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return new NextResponse(null, {
        status: response.status === 404 ? 404 : 502,
        statusText: response.statusText,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const imageArrayBuffer = await response.arrayBuffer();

    return new NextResponse(imageArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    console.warn(`[CCTV Evidence Proxy Error] Gagal fetch ${upstreamPath}:`, error?.message);
    return new NextResponse(null, {
      status: 504,
      statusText: "Gateway Timeout",
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }
}
