import type { WhatsAppSendInput, WhatsAppSendResult } from "../types";

export async function sendMetaCloudApi(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
  const baseUrl = process.env.WHATSAPP_CLOUD_API_BASE_URL || "https://graph.facebook.com/v20.0";
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return { status: "failed", provider: "meta_cloud_api", errorMessage: "WhatsApp Cloud API token/phone number belum dikonfigurasi." };
  const response = await fetch(`${baseUrl}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: input.to, type: "text", text: { preview_url: false, body: input.body } })
  });
  const result = await response.json().catch(() => null) as { messages?: Array<{ id?: string }>; error?: { message?: string } } | null;
  if (!response.ok) return { status: "failed", provider: "meta_cloud_api", errorMessage: result?.error?.message || "WhatsApp Cloud API gagal mengirim." };
  return { status: "sent", provider: "meta_cloud_api", providerMessageId: result?.messages?.[0]?.id };
}
