import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { can, landingPageForRole } from "@/lib/auth/roles";
import { resolveAuthProvider, resolveRequestRole, resolveRequestUser } from "@/lib/auth/request";

const LOCAL_SESSION_COOKIE = "aneka_jaya_session";
const ANIKA_ERP_TOKEN_COOKIE = "aneka_jaya_erp_token";

const PROTECTED: Array<{ path: string; permission: Parameters<typeof can>[1] }> = [
  { path: "/dashboard", permission: "dashboard.view" },
  { path: "/reports", permission: "reports.view" },
  { path: "/settings", permission: "settings.view" },
  { path: "/audit-trail", permission: "audit.view" },
  { path: "/erp-sync", permission: "erp_sync.retry" },
  { path: "/approval", permission: "approval.view" },
  { path: "/tempo", permission: "tempo.view" },
  { path: "/penjualan", permission: "penjualan.create" },
  { path: "/pengeluaran/input", permission: "pengeluaran.create" },
  { path: "/pengeluaran", permission: "pengeluaran.view" },
  { path: "/barang", permission: "stock.view" },
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/") || pathname === "/" || pathname === "/no-access" || pathname === "/login") return NextResponse.next();
  const provider = resolveAuthProvider();
  const trustedHeaderMode = provider === "trusted_header";
  const localCredentialsMode = provider === "local_credentials" || provider === "anika_erp";
  const missingErpSession = provider === "anika_erp" && !request.cookies.get(ANIKA_ERP_TOKEN_COOKIE)?.value;
  const user = trustedHeaderMode ? resolveRequestUser(request) : null;
  if (trustedHeaderMode && user?.id === "unauthenticated") return NextResponse.redirect(new URL("/login", request.url));
  if (trustedHeaderMode) return NextResponse.next();
  if (localCredentialsMode && (!request.cookies.get(LOCAL_SESSION_COOKIE)?.value || missingErpSession)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (localCredentialsMode) return NextResponse.next();
  const role = resolveRequestRole(request);
  for (const rule of PROTECTED) {
    if (pathname === rule.path || pathname.startsWith(`${rule.path}/`)) {
      if (!can(role, rule.permission)) {
        const landing = landingPageForRole(role);
        return NextResponse.redirect(new URL(landing === pathname ? "/no-access" : landing, request.url));
      }
      break;
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
