import type { WhatsAppSendInput, WhatsAppSendResult } from "../types";

export async function sendThirdPartyProvider(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
  const endpoint = process.env.WHATSAPP_THIRD_PARTY_ENDPOINT;
  const token = process.env.WHATSAPP_THIRD_PARTY_TOKEN;
  if (!endpoint || !token) return { status: "failed", provider: "third_party", errorMessage: "Third-party WhatsApp endpoint/token belum dikonfigurasi." };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to: input.to, message: input.body })
  });
  const result = await response.json().catch(() => null) as { id?: string; messageId?: string; error?: string } | null;
  if (!response.ok) return { status: "failed", provider: "third_party", errorMessage: result?.error || "Provider WhatsApp gagal mengirim." };
  return { status: "sent", provider: "third_party", providerMessageId: result?.id || result?.messageId };
}
