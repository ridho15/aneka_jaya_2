import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  recipientFindMany: vi.fn(),
  recipientCreate: vi.fn(),
  recipientFindUnique: vi.fn(),
  recipientUpdate: vi.fn(),
  logFindMany: vi.fn(),
  logCreate: vi.fn(),
  logUpdate: vi.fn(),
  recordAudit: vi.fn(),
  sendMeta: vi.fn(),
  sendThirdParty: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    whatsAppRecipient: {
      findMany: mocks.recipientFindMany,
      create: mocks.recipientCreate,
      findUnique: mocks.recipientFindUnique,
      update: mocks.recipientUpdate
    },
    whatsAppMessageLog: {
      findMany: mocks.logFindMany,
      create: mocks.logCreate,
      update: mocks.logUpdate
    }
  }
}));
vi.mock("@/lib/audit/store", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/whatsapp/providers/metaCloudApi", () => ({ sendMetaCloudApi: mocks.sendMeta }));
vi.mock("@/lib/whatsapp/providers/thirdPartyProvider", () => ({ sendThirdPartyProvider: mocks.sendThirdParty }));

import {
  createWhatsappRecipient,
  getWhatsappProviderStatus,
  listWhatsappRecipients,
  sendWhatsappMessage,
  summarizeWhatsappResults
} from "@/lib/whatsapp/whatsappClient";

const date = new Date("2026-06-30T01:00:00.000Z");

describe("WhatsApp settings storage and sending", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it("reads recipients from Prisma with report flags", async () => {
    mocks.recipientFindMany.mockResolvedValue([
      { id: "r1", name: "Owner", phone: "6281234567890", isActive: true, receivesDailyReport: true, receivesStockAlert: false, receivesTempoReminder: true, createdAt: date, updatedAt: date }
    ]);

    await expect(listWhatsappRecipients()).resolves.toEqual([
      expect.objectContaining({ id: "r1", phoneNumber: "6281234567890", receivesDailyReport: true, receivesTempoReminder: true })
    ]);
  });

  it("creates recipients in Prisma and audits a masked phone", async () => {
    mocks.recipientCreate.mockResolvedValue({ id: "r1", name: "Owner", phone: "6281234567890", isActive: true, receivesDailyReport: true, receivesStockAlert: true, receivesTempoReminder: false, createdAt: date, updatedAt: date });

    await createWhatsappRecipient({ name: "Owner", phoneNumber: "6281234567890", receivesDailyReport: true, receivesStockAlert: true });

    expect(mocks.recipientCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "Owner", phone: "6281234567890", receivesDailyReport: true, receivesStockAlert: true })
    }));
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      afterValue: expect.objectContaining({ phoneNumber: "62***890" })
    }));
  });

  it("reports provider configuration status without exposing secrets", () => {
    expect(getWhatsappProviderStatus()).toEqual(expect.objectContaining({ ready: false, missing: ["WHATSAPP_PROVIDER"] }));
    vi.stubEnv("WHATSAPP_PROVIDER", "meta_cloud_api");
    expect(getWhatsappProviderStatus()).toEqual(expect.objectContaining({ ready: false, missing: ["WHATSAPP_CLOUD_API_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"] }));
    vi.stubEnv("WHATSAPP_CLOUD_API_TOKEN", "secret");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "phone-id");
    expect(getWhatsappProviderStatus()).toEqual(expect.objectContaining({ ready: true, provider: "meta_cloud_api" }));
  });

  it("does not store full message body in WhatsApp logs", async () => {
    vi.stubEnv("WHATSAPP_PROVIDER", "meta_cloud_api");
    vi.stubEnv("WHATSAPP_CLOUD_API_TOKEN", "secret");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "phone-id");
    mocks.logCreate.mockResolvedValue({ id: "log1", recipientId: "r1", recipient: "Owner", messageType: "test", status: "pending", reportType: "test", provider: "meta_cloud_api", recipientNameSnapshot: "Owner", phoneMaskedSnapshot: "62***890", providerMessageId: null, errorMessage: null, sentAt: null, createdAt: date });
    mocks.sendMeta.mockResolvedValue({ status: "sent", provider: "meta_cloud_api", providerMessageId: "wamid.1" });
    mocks.logUpdate.mockResolvedValue({ id: "log1", recipientId: "r1", recipient: "Owner", messageType: "test", status: "sent", reportType: "test", provider: "meta_cloud_api", recipientNameSnapshot: "Owner", phoneMaskedSnapshot: "62***890", providerMessageId: "wamid.1", errorMessage: null, sentAt: date, createdAt: date });

    await sendWhatsappMessage({ id: "r1", name: "Owner", phoneNumber: "6281234567890", isActive: true, receivesDailyReport: true, receivesStockAlert: true, receivesTempoReminder: true, createdAt: date.toISOString(), updatedAt: date.toISOString() }, "test", "Isi laporan rahasia lengkap");

    expect(mocks.logCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ messageBody: expect.anything() })
    }));
    expect(JSON.stringify(mocks.logCreate.mock.calls[0][0].data)).not.toContain("Isi laporan rahasia lengkap");
  });

  it("summarizes allSettled send results", () => {
    const result = summarizeWhatsappResults([
      { status: "fulfilled", value: { id: "1", reportType: "test", recipientNameSnapshot: "A", phoneMaskedSnapshot: "62***111", provider: "meta_cloud_api", status: "sent", createdAt: date.toISOString() } },
      { status: "fulfilled", value: { id: "2", reportType: "test", recipientNameSnapshot: "B", phoneMaskedSnapshot: "62***222", provider: "meta_cloud_api", status: "failed", createdAt: date.toISOString() } },
      { status: "rejected", reason: new Error("Provider timeout") }
    ]);

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(2);
  });
});
