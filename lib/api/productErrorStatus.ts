export function productErrorStatus(code?: string) {
  if (code === "ERP_SESSION_REQUIRED") return 401;
  if (code === "ERP_NOT_CONFIGURED") return 503;
  if (code === "ERP_TIMEOUT") return 504;
  if (code === "ERP_AUTH" || code === "ERP_UPSTREAM" || code === "ERP_NETWORK") return 502;
  return 500;
}
