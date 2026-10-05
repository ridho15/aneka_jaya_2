import type { DeliveryOrderData } from "@/lib/deliveryOrders/types";

export const THERMAL_80MM_WIDTH = 48; // Standard 48 characters for 80mm thermal printer (Font A)

/**
 * Truncates or pads a string to fit within a given width
 */
export function padOrTruncate(
  text: string | number | undefined | null,
  width: number,
  align: "left" | "right" | "center" = "left"
): string {
  const str = text === undefined || text === null ? "" : String(text);
  if (str.length > width) {
    return str.slice(0, width);
  }
  const diff = width - str.length;
  if (align === "right") {
    return " ".repeat(diff) + str;
  }
  if (align === "center") {
    const leftPad = Math.floor(diff / 2);
    const rightPad = diff - leftPad;
    return " ".repeat(leftPad) + str + " ".repeat(rightPad);
  }
  return str + " ".repeat(diff);
}

/**
 * Creates a two-column line with left and right aligned content
 */
export function twoColumn(
  left: string,
  right: string,
  width = THERMAL_80MM_WIDTH
): string {
  if (left.length + right.length + 1 > width) {
    const maxLeft = width - right.length - 1;
    return left.slice(0, maxLeft) + " " + right;
  }
  const spaces = width - left.length - right.length;
  return left + " ".repeat(spaces) + right;
}

/**
 * Formats multi-line label-value pair
 */
export function formatKeyValue(
  label: string,
  value: string | undefined | null,
  width = THERMAL_80MM_WIDTH
): string[] {
  const val = value?.trim() || "-";
  const labelPart = `${label}: `;
  const remainingWidth = width - labelPart.length;

  if (val.length <= remainingWidth) {
    return [labelPart + val];
  }

  // Wrap long text
  const lines: string[] = [];
  const words = val.split(" ");
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length <= remainingWidth) {
      currentLine = (currentLine + " " + word).trim();
    } else {
      if (currentLine) {
        lines.push(lines.length === 0 ? labelPart + currentLine : " ".repeat(labelPart.length) + currentLine);
      }
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(lines.length === 0 ? labelPart + currentLine : " ".repeat(labelPart.length) + currentLine);
  }

  return lines;
}

/**
 * Generates formatted minimal text representation for clipboard (Copy Text)
 * Only Invoice Number and Customer Name, without labels or extra info.
 */
export function generateDeliveryOrderThermalText(detail: DeliveryOrderData): string {
  const invoiceNumber = detail.sale.transactionNumber || detail.doNumber;
  const customerName = (detail.sale.customerName || "CUSTOMER").toUpperCase();

  return `${invoiceNumber}\n${customerName}\n`;
}

/**
 * Generates raw ESC/POS binary command buffer for 80mm Bluetooth thermal printer
 * Minimalist landscape format: Only Invoice Number and Customer Name,
 * in MAXIMUM BOLD font size filling the paper, without labels or extra info.
 */
export function generateDeliveryOrderEscPos(detail: DeliveryOrderData): Uint8Array {
  const encoder = new TextEncoder();
  const bytes: number[] = [];

  const push = (...b: number[]) => bytes.push(...b);
  const pushText = (text: string) => {
    const encoded = encoder.encode(text);
    for (let i = 0; i < encoded.length; i++) {
      bytes.push(encoded[i]);
    }
  };

  const invoiceNumber = detail.sale.transactionNumber || detail.doNumber;
  const customerName = (detail.sale.customerName || "CUSTOMER").toUpperCase();

  // 1. Initialize printer
  push(0x1b, 0x40); // ESC @ (Initialize)

  // 2. Enable 90-degree clockwise rotation (Landscape on continuous roll)
  push(0x1b, 0x56, 0x01); // ESC V 1 (Turn 90° clockwise rotation ON)

  // 3. Center alignment
  push(0x1b, 0x61, 0x01); // ESC a 1 (Center align)

  // 4. Maximum Bold & Double-strike
  push(0x1b, 0x45, 0x01); // ESC E 1 (Bold ON)
  push(0x1b, 0x47, 0x01); // ESC G 1 (Double-strike bold ON)

  // Max font scaling for Invoice Number (4x width & 4x height: JUMBO)
  const invScale = 0x33; // 4x width, 4x height (96 dots)
  push(0x1d, 0x21, invScale); // GS ! n
  pushText(invoiceNumber + "\n\n");

  // Max font scaling for Customer Name (4x width & 4x height if <= 16 chars, 3x width & 3x height if > 16 chars)
  const custScale = customerName.length <= 16 ? 0x33 : 0x22;
  push(0x1d, 0x21, custScale); // GS ! n
  pushText(customerName + "\n\n");

  // Reset font scaling & bold & rotation
  push(0x1d, 0x21, 0x00); // Normal size
  push(0x1b, 0x45, 0x00); // Bold OFF
  push(0x1b, 0x56, 0x00); // ESC V 0 (Turn 90° rotation OFF)

  // Feed & Cut
  push(0x1b, 0x64, 0x03); // Feed 3 lines
  push(0x1d, 0x56, 0x42, 0x00); // GS V 66 0 (Cut paper)

  return new Uint8Array(bytes);
}

/**
 * Creates an Android RawBT intent URL for direct 1-tap printing
 */
export function generateRawBtUrl(detail: DeliveryOrderData): string {
  const escposBytes = generateDeliveryOrderEscPos(detail);
  let binary = "";
  const len = escposBytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(escposBytes[i]);
  }
  const base64 = btoa(binary);
  return `rawbt:data:base64,${base64}`;
}
