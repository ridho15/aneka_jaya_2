export function productErrorStatus(code?: string) {
  console.log("Error code", code);
  if (code === "ERP_SESSION_REQUIRED") return 401;
  if (code === "ERP_NOT_CONFIGURED") return 503;
  if (code === "ERP_TIMEOUT") return 504;
  return 500;
}
