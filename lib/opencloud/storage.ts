import "server-only";
import { isOpenCloudConfigured } from "./auth";
import type { UploadedFile } from "@/lib/types/opencloud";
import type { ApiResponse } from "@/lib/types/api";
import { failure } from "@/lib/types/api";

export const ALLOWED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const MAX_FILE_SIZE = Number(process.env.OPENCLOUD_MAX_FILE_SIZE_BYTES || 5 * 1024 * 1024);

export function validateUpload(file: File): ApiResponse<true> {
  if (!ALLOWED_FILE_TYPES.includes(file.type)) return failure("Format file harus PDF, JPG, JPEG, PNG, atau WEBP.", "INVALID_FILE_TYPE");
  if (file.size > MAX_FILE_SIZE) return failure(`Ukuran file maksimal ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB.`, "FILE_TOO_LARGE");
  return { success: true, data: true };
}

export async function uploadReceipt(file: File): Promise<ApiResponse<UploadedFile>> {
  const valid = validateUpload(file); if (!valid.success) return valid;
  if (!isOpenCloudConfigured()) return failure("OpenCloud belum dikonfigurasi. Bukti pembayaran tidak dapat diunggah.", "OPENCLOUD_NOT_CONFIGURED");
  // TODO: Connect this function to OpenCloud storage API after credentials and its upload schema are provided.
  return failure("Integrasi unggah OpenCloud masih menunggu konfigurasi API.", "OPENCLOUD_SCHEMA_PENDING");
}
