import "server-only";
import { anikaRequest } from "./anikaClient";
import type { ApiResponse } from "@/lib/types/api";

type NeoCommand = { text: string; parsedIntent?: Record<string, unknown> };

export async function sendNeoCommand<T>({ text, parsedIntent }: NeoCommand): Promise<ApiResponse<T>> {
  // The documented NeoCommandRequest requires a natural-language `text` field. parsed_intent gives Neo structured
  // references while keeping the request compatible with the official WhatsApp adapter.
  return anikaRequest<T>("/neo/commands", {
    method: "POST",
    body: JSON.stringify({ message_id: crypto.randomUUID(), source: "internal_app", text, parsed_intent: parsedIntent })
  });
}
