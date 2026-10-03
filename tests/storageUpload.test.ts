import { describe, expect, it, afterEach, vi } from "vitest";
vi.mock("server-only", () => ({}));
let mockRole = "DELIVERY_DRIVER";
vi.mock("@/lib/auth/session", () => ({
  getCurrentRole: vi.fn(async () => mockRole)
}));
import { stat, unlink } from "node:fs/promises";
import path from "node:path";
import { uploadReceipt, validateUpload, ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from "@/lib/opencloud/storage";
import { pengeluaranSchema } from "@/lib/validation/pengeluaranSchema";
import { tempoPaymentSchema } from "@/lib/validation/tempoSchema";
import { GET as uploadsRouteHandler } from "@/app/uploads/[...path]/route";
import { POST as uploadRouteHandler } from "@/app/api/upload/route";

describe("Storage Upload & Local Engine", () => {
  const createdTestFiles: string[] = [];

  afterEach(async () => {
    mockRole = "DELIVERY_DRIVER";
    vi.unstubAllEnvs();
    for (const filePath of createdTestFiles) {
      await unlink(filePath).catch(() => {});
    }
    createdTestFiles.length = 0;
  });

  describe("validateUpload", () => {
    it("accepts valid image and pdf files within size limit", () => {
      const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      for (const type of validTypes) {
        const file = new File([new Uint8Array(100)], "test-file", { type });
        const result = validateUpload(file);
        expect(result.success).toBe(true);
      }
    });

    it("rejects unsupported file types", () => {
      const invalidFile = new File(["test data"], "script.sh", { type: "text/x-sh" });
      const result = validateUpload(invalidFile);
      expect(result.success).toBe(false);
      expect(result.code).toBe("INVALID_FILE_TYPE");
    });

    it("rejects files exceeding maximum file size limit", () => {
      const oversizedFile = new File([new Uint8Array(10)], "large.jpg", { type: "image/jpeg" });
      Object.defineProperty(oversizedFile, "size", { value: MAX_FILE_SIZE + 1024 });

      const result = validateUpload(oversizedFile);
      expect(result.success).toBe(false);
      expect(result.code).toBe("FILE_TOO_LARGE");
    });
  });

  describe("uploadReceipt with Local Fallback", () => {
    it("saves uploaded receipt locally when OpenCloud is unconfigured", async () => {
      const fileData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      const file = new File([fileData], "bukti-resi-kurir.jpg", { type: "image/jpeg" });

      const response = await uploadReceipt(file);

      expect(response.success).toBe(true);
      if (!response.success) return;

      expect(response.data.url).toMatch(/^\/uploads\/receipts\/receipt-\d+-[a-f0-9]+\.jpg$/);
      expect(response.data.contentType).toBe("image/jpeg");
      expect(response.data.name).toBe("bukti-resi-kurir.jpg");
      expect(response.data.size).toBe(fileData.length);

      // Verify file physically exists on disk
      const localDiskPath = path.join(process.cwd(), "public", response.data.url.replace(/^\//, ""));
      createdTestFiles.push(localDiskPath);

      const fileInfo = await stat(localDiskPath);
      expect(fileInfo.isFile()).toBe(true);
      expect(fileInfo.size).toBe(fileData.length);
    });
  });

  describe("Uploads Route Handler (GET /uploads/[...path])", () => {
    it("serves saved files with correct content type and caching headers", async () => {
      const fileData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header
      const file = new File([fileData], "test-photo.png", { type: "image/png" });
      const uploadResult = await uploadReceipt(file);
      expect(uploadResult.success).toBe(true);
      if (!uploadResult.success) return;

      const filename = path.basename(uploadResult.data.url);
      const localDiskPath = path.join(process.cwd(), "public", "uploads", "receipts", filename);
      createdTestFiles.push(localDiskPath);

      const req = new Request("http://localhost:3000/uploads/receipts/" + filename);
      const res = await uploadsRouteHandler(req, {
        params: Promise.resolve({ path: ["receipts", filename] })
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/png");
      expect(res.headers.get("Cache-Control")).toContain("immutable");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("returns 404 for non-existent files", async () => {
      const req = new Request("http://localhost:3000/uploads/receipts/non-existent.jpg");
      const res = await uploadsRouteHandler(req, {
        params: Promise.resolve({ path: ["receipts", "non-existent.jpg"] })
      });

      expect(res.status).toBe(404);
    });

    it("blocks directory traversal attacks", async () => {
      const req = new Request("http://localhost:3000/uploads/../../package.json");
      const res = await uploadsRouteHandler(req, {
        params: Promise.resolve({ path: ["..", "..", "package.json"] })
      });

      expect(res.status).toBe(403);
    });
  });

  describe("Validation Schemas with Local Upload URLs", () => {
    it("validates pengeluaranSchema with root-relative upload URL and full URL", () => {
      const basePengeluaran = {
        expenseDate: "2026-10-03",
        tipeId: "W",
        rekeningId: "rek-1",
        rekeningNameSnapshot: "BCA Operasional",
        category: "Operasional Gudang",
        vendorName: "PT Logistik Jaya",
        description: "Beli lakban dan bubble wrap",
        amount: 150000,
        paymentMethod: "Cash"
      };

      // Local path
      const localResult = pengeluaranSchema.safeParse({
        ...basePengeluaran,
        attachmentUrl: "/uploads/receipts/receipt-1234.jpg"
      });
      expect(localResult.success).toBe(true);

      // Full URL
      const fullUrlResult = pengeluaranSchema.safeParse({
        ...basePengeluaran,
        attachmentUrl: "https://storage.cloud.com/receipt-1234.jpg"
      });
      expect(fullUrlResult.success).toBe(true);

      // Empty string
      const emptyResult = pengeluaranSchema.safeParse({
        ...basePengeluaran,
        attachmentUrl: ""
      });
      expect(emptyResult.success).toBe(true);

      // Invalid string format
      const invalidResult = pengeluaranSchema.safeParse({
        ...basePengeluaran,
        attachmentUrl: "invalid-url-without-slash"
      });
      expect(invalidResult.success).toBe(false);
    });

    it("validates tempoPaymentSchema with root-relative upload URL", () => {
      const basePayment = {
        paymentDate: "2026-10-03",
        amountPaid: 500000,
        paymentMethod: "TF" as const,
        rekeningId: "rek-1"
      };

      const localResult = tempoPaymentSchema.safeParse({
        ...basePayment,
        attachmentUrl: "/uploads/receipts/bukti-transfer-tempo.jpg"
      });
      expect(localResult.success).toBe(true);
    });
  });

  describe("API Route POST /api/upload", () => {
    it("returns 201 Created with uploaded file URL for authorized role", async () => {
      mockRole = "DELIVERY_DRIVER";

      const formData = new FormData();
      const fileData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x11, 0x22]);
      const file = new File([fileData], "resi-delivery.jpg", { type: "image/jpeg" });
      formData.append("file", file);

      const req = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData
      });

      const response = await uploadRouteHandler(req);
      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.url).toMatch(/^\/uploads\/receipts\/receipt-/);

      const localDiskPath = path.join(process.cwd(), "public", json.data.url.replace(/^\//, ""));
      createdTestFiles.push(localDiskPath);
    });

    it("returns 403 Forbidden for unauthorized role", async () => {
      mockRole = "VIEWER";

      const formData = new FormData();
      const file = new File([new Uint8Array(10)], "unauthorized.jpg", { type: "image/jpeg" });
      formData.append("file", file);

      const req = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData
      });

      const response = await uploadRouteHandler(req);
      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.success).toBe(false);
    });

    it("returns 400 when file is missing in formData", async () => {
      mockRole = "OWNER";

      const formData = new FormData();
      const req = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData
      });

      const response = await uploadRouteHandler(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.code).toBe("MISSING_FILE");
    });
  });
});
