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
 * Helper to determine order origin:
 * - "SIP : MJ" for orders originating from mj.playgo.id
 * - "SIP : AJ" for default internal Aneka Jaya (SLM) orders
 */
export function getDeliveryOrderSourceLabel(detail: DeliveryOrderData): "SIP : MJ" | "SIP : AJ" {
  const isMj = detail.sale.source === "MJ" || detail.sale.createdByUserId === "integration:mj";
  return isMj ? "SIP : MJ" : "SIP : AJ";
}

/**
 * Generates formatted minimal text representation for clipboard (Copy Text)
 * Invoice Number, Customer Name, and Source Indicator (SIP / MJ).
 */
export function generateDeliveryOrderThermalText(detail: DeliveryOrderData, printUserName?: string): string {
  const invoiceNumber = detail.sale.transactionNumber || detail.doNumber;
  const customerName = (detail.sale.customerName || "CUSTOMER").toUpperCase();
  const sourceLabel = getDeliveryOrderSourceLabel(detail);
  const rawOfficer = printUserName || detail.assignedOfficers?.[0]?.userName || detail.assignedUserName || "";
  const officerName = rawOfficer.replace(/\s*\([^)]*\)/g, "").trim().toUpperCase();

  const footerLine = officerName ? `${sourceLabel}   ${officerName}` : sourceLabel;
  return `${invoiceNumber}\n${customerName}\n${footerLine}\n`;
}

/**
 * Generates raw ESC/POS binary command buffer for 80mm Bluetooth thermal printer
 * Minimalist landscape format: Invoice Number, Customer Name, and Source Indicator (SIP / MJ),
 * in MAXIMUM BOLD font size filling the paper, without labels or extra info.
 */
export function generateDeliveryOrderEscPos(detail: DeliveryOrderData, printUserName?: string): Uint8Array {
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
  const sourceLabel = getDeliveryOrderSourceLabel(detail);
  const rawOfficer = printUserName || detail.assignedOfficers?.[0]?.userName || detail.assignedUserName || "";
  const officerName = rawOfficer.replace(/\s*\([^)]*\)/g, "").trim().toUpperCase();

  // 1. Initialize printer
  push(0x1b, 0x40); // ESC @ (Initialize)

  // 2. Ensure standard horizontal orientation (Rotation OFF)
  push(0x1b, 0x56, 0x00); // ESC V 0

  // 3. Center alignment
  push(0x1b, 0x61, 0x01); // ESC a 1 (Center align)

  // 4. Maximum Bold & Double-strike
  push(0x1b, 0x45, 0x01); // ESC E 1 (Bold ON)
  push(0x1b, 0x47, 0x01); // ESC G 1 (Double-strike bold ON)

  // 5. Dynamic 2x Jumbo Scaling:
  // Standard 80mm printable width = 576 dots. Font A base size = 12x24 dots.
  // ESC/POS GS ! n command: n = ((widthMultiplier - 1) << 4) | (heightMultiplier - 1)
  // Height is 8x maximum (192 dots / ~24mm) -> 2x taller than previous 4x
  
  // Invoice Number (e.g. 051026-33 = 9 chars: 5x width = 540 dots, fills 94% of paper)
  let invWidth = 4;
  if (invoiceNumber.length <= 6) {
    invWidth = 8;
  } else if (invoiceNumber.length <= 9) {
    invWidth = 5;
  } else if (invoiceNumber.length <= 12) {
    invWidth = 4;
  } else {
    invWidth = 3;
  }
  const invScale = ((invWidth - 1) << 4) | 0x07; // 8x height (0x07)
  push(0x1d, 0x21, invScale); // GS ! n
  pushText(invoiceNumber + "\n\n");

  // Customer Name (e.g. FIRMAN = 6 chars: 8x width = 576 dots, fills 100% of paper)
  let custWidth = 4;
  let custHeight = 8;
  if (customerName.length <= 6) {
    custWidth = 8;
    custHeight = 8;
  } else if (customerName.length <= 8) {
    custWidth = 6;
    custHeight = 8;
  } else if (customerName.length <= 9) {
    custWidth = 5;
    custHeight = 8;
  } else if (customerName.length <= 12) {
    custWidth = 4;
    custHeight = 7;
  } else {
    custWidth = 3;
    custHeight = 5;
  }
  const custScale = ((custWidth - 1) << 4) | (custHeight - 1);
  push(0x1d, 0x21, custScale); // GS ! n
  pushText(customerName + "\n\n");

  // 3rd Line: Source indicator & Officer Name at the far edge - Normal 1x font size
  push(0x1d, 0x21, 0x00); // GS ! 0 (Normal 1x font size)
  push(0x1b, 0x45, 0x01); // Bold ON
  const footerLine = officerName ? twoColumn(sourceLabel, officerName) : sourceLabel;
  pushText(footerLine + "\n\n");

  // Reset font scaling & bold
  push(0x1d, 0x21, 0x00); // Normal size
  push(0x1b, 0x45, 0x00); // Bold OFF
  push(0x1b, 0x47, 0x00); // Double-strike OFF

  // Feed & Cut (Strictly limited to 2 lines feed to respect 15cm paper limitation)
  push(0x1b, 0x64, 0x02); // Feed 2 lines
  push(0x1d, 0x56, 0x42, 0x00); // GS V 66 0 (Cut paper)

  return new Uint8Array(bytes);
}

/**
 * Creates an Android RawBT intent URL for direct 1-tap printing
 */
export function generateRawBtUrl(detail: DeliveryOrderData, printUserName?: string): string {
  const escposBytes = generateDeliveryOrderEscPos(detail, printUserName);
  let binary = "";
  const len = escposBytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(escposBytes[i]);
  }
  const base64 = btoa(binary);
  return `rawbt:data:base64,${base64}`;
}
