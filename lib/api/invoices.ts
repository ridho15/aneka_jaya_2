import "server-only";
import { anikaRequest } from "./anikaClient";
import type { ApiResponse } from "@/lib/types/api";
export const listInvoices = (): Promise<ApiResponse<unknown>> => anikaRequest("/invoices");
