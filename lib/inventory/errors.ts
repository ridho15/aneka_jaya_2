export type InventoryErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "INSUFFICIENT_STOCK"
  | "DUPLICATE"
  | "INVALID_STATE";

export class InventoryError extends Error {
  constructor(
    public code: InventoryErrorCode,
    message: string,
    public status = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = "InventoryError";
  }
}

export function inventoryErrorBody(error: unknown) {
  if (error instanceof InventoryError) {
    return { status: error.status, body: { success: false as const, message: error.message, code: error.code, details: error.details } };
  }
  const prismaCode = (error as { code?: string })?.code;
  if (prismaCode === "P2002") {
    return { status: 409, body: { success: false as const, message: "Data dengan kode/nomor yang sama sudah ada.", code: "DUPLICATE" } };
  }
  console.error("[inventory]", error);
  return { status: 500, body: { success: false as const, message: "Terjadi kesalahan pada modul inventory.", code: "INTERNAL" } };
}
