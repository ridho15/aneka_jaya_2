export type MjErrorCode =
  | "AUTH_INVALID" | "RATE_LIMITED" | "VALIDATION_FAILED" | "REFERENCE_CONFLICT"
  | "CUSTOMER_INVALID" | "PRODUCT_INVALID" | "ACCOUNT_INVALID" | "INVOICE_LOCKED"
  | "PAYMENT_EXCEEDS_REMAINING" | "PAYMENT_REFERENCE_CONFLICT" | "AJ_TIMEOUT"
  | "AJ_UPSTREAM_ERROR" | "AJ_CONTRACT_PENDING" | "INTERNAL_ERROR";

export class MjIntegrationError extends Error {
  constructor(
    readonly code: MjErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown,
    readonly retryable = false
  ) {
    super(message);
    this.name = "MjIntegrationError";
  }
}

export function mjErrorResponse(error: unknown) {
  const value = error instanceof MjIntegrationError
    ? error
    : new MjIntegrationError("INTERNAL_ERROR", "Terjadi kesalahan internal.", 500);
  return Response.json({ success: false, error: { code: value.code, message: value.message, details: value.details }, retryable: value.retryable }, { status: value.status });
}
