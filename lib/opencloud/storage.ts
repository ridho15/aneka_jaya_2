import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { isOpenCloudConfigured } from "./auth";
import type { UploadedFile } from "@/lib/types/opencloud";
import type { ApiResponse } from "@/lib/types/api";
import { failure } from "@/lib/types/api";

export const ALLOWED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const MAX_FILE_SIZE = Number(process.env.OPENCLOUD_MAX_FILE_SIZE_BYTES || 5 * 1024 * 1024);

const EXTENSION_MAP: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

export function validateUpload(file: File): ApiResponse<true> {
  if (!ALLOWED_FILE_TYPES.includes(file.type)) return failure("Format file harus PDF, JPG, JPEG, PNG, atau WEBP.", "INVALID_FILE_TYPE");
  if (file.size > MAX_FILE_SIZE) return failure(`Ukuran file maksimal ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB.`, "FILE_TOO_LARGE");
  return { success: true, data: true };
}

export async function saveLocalReceipt(file: File): Promise<ApiResponse<UploadedFile>> {
  try {
    const ext = EXTENSION_MAP[file.type] || path.extname(file.name) || ".jpg";
    const uniqueId = crypto.randomUUID().slice(0, 8);
    const filename = `receipt-${Date.now()}-${uniqueId}${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "receipts");

    await mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = path.join(uploadDir, filename);
    await writeFile(filePath, buffer);

    const uploadedFile: UploadedFile = {
      url: `/uploads/receipts/${filename}`,
      reference: filename,
      name: file.name,
      size: file.size,
      contentType: file.type
    };

    return {
      success: true,
      data: uploadedFile
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menyimpan berkas di penyimpanan lokal.";
    return failure(`Gagal menyimpan berkas lokal: ${message}`, "LOCAL_STORAGE_WRITE_FAILED");
  }
}

export async function uploadReceipt(file: File): Promise<ApiResponse<UploadedFile>> {
  const valid = validateUpload(file);
  if (!valid.success) return valid;

  if (isOpenCloudConfigured()) {
    // OpenCloud integration when credentials and schema are configured
    return failure("Integrasi unggah OpenCloud masih menunggu konfigurasi API.", "OPENCLOUD_SCHEMA_PENDING");
  }

  // Seamless local disk storage fallback
  return saveLocalReceipt(file);
}
