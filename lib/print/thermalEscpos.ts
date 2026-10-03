import type { DeliveryOrderData } from "@/lib/deliveryOrders/types";
import { formatJakartaDate } from "@/lib/date/jakarta";

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
 * Generates formatted 48-column thermal text for preview or raw text printing
 */
export function generateDeliveryOrderThermalText(detail: DeliveryOrderData): string {
  const W = THERMAL_80MM_WIDTH;
  const sep = "=".repeat(W);
  const thin = "-".repeat(W);
  const star = "*".repeat(W);

  const lines: string[] = [
    sep,
    padOrTruncate("ANEKA JAYA / SLM", W, "center"),
    padOrTruncate("SURAT JALAN PENGIRIMAN (DO)", W, "center"),
    sep,
    "",
    star,
    padOrTruncate("PELANGGAN / CUSTOMER", W, "center"),
    padOrTruncate((detail.sale.customerName || "PELANGGAN").toUpperCase(), W, "center"),
    star,
    "",
    twoColumn(
      `INVOICE: ${detail.sale.transactionNumber || "-"}`,
      `DO: ${detail.doNumber}`
    ),
    thin,
    ...formatKeyValue("Tanggal Kirim", detail.sale.deliveryAt ? formatJakartaDate(detail.sale.deliveryAt) : formatJakartaDate(detail.sale.saleDate)),
    ...formatKeyValue("Ekspedisi/Kurir", detail.sale.shippingMethod || "Reguler / Kurir Toko"),
    ...formatKeyValue("Alamat Tujuan", detail.sale.customerLocation || "-"),
  ];

  if (detail.trackingNumber) {
    lines.push(...formatKeyValue("Nomor Resi", detail.trackingNumber));
  }

  const driverName = detail.shippedByNameSnapshot || detail.assignedUserName || "-";
  lines.push(...formatKeyValue("Petugas / Supir", driverName));

  lines.push(
    "",
    thin,
    twoColumn("RINCIAN BARANG", "LOKASI RAK"),
    thin
  );

  // Strictly masked: SKU, Qty, Unit, Rack (No Prices)
  let totalQty = 0;
  detail.items.forEach((item, idx) => {
    totalQty += item.quantity;
    const no = `${idx + 1}.`;
    const namePart = item.productNameSnapshot || item.productRef || "Item";
    const qtyPart = `${item.quantity} ${item.unitSnapshot || "PCS"}`;
    const rackPart = item.rackNameSnapshot || item.warehouseNameSnapshot || "-";

    // Line 1: No + Name
    lines.push(`${padOrTruncate(no, 3)} ${namePart}`);
    // Line 2: Qty & Rack
    lines.push(twoColumn(`    Qty: ${qtyPart}`, `Rak: ${rackPart}`));
  });

  lines.push(
    thin,
    twoColumn(`TOTAL: ${detail.items.length} Macam Barang`, `Total Unit: ${totalQty}`),
    thin
  );

  if (detail.notes) {
    lines.push(...formatKeyValue("Catatan", detail.notes));
    lines.push(thin);
  }

  lines.push(
    "",
    "Tanda Tangan Serah Terima:",
    "",
    twoColumn("  Pengirim / Sopir", "  Penerima / Toko "),
    "",
    "",
    "",
    twoColumn(" (................) ", " (................) "),
    "",
    padOrTruncate("Harap periksa kelengkapan saat serah terima", W, "center"),
    sep,
    ""
  );

  return lines.join("\n");
}

/**
 * Generates raw ESC/POS binary command buffer for 80mm Bluetooth thermal printer
 * Emphasizes Customer Name and Invoice Number in MAXIMUM/JUMBO font sizes.
 */
export function generateDeliveryOrderEscPos(detail: DeliveryOrderData): Uint8Array {
  const encoder = new TextEncoder();
  const bytes: number[] = [];

  // Helper to push raw ASCII/bytes
  const push = (...b: number[]) => bytes.push(...b);
  const pushText = (text: string) => {
    const encoded = encoder.encode(text);
    for (let i = 0; i < encoded.length; i++) {
      bytes.push(encoded[i]);
    }
  };

  const lineFeed = () => push(0x0a);

  // 1. Initialize printer
  push(0x1b, 0x40); // ESC @ (Initialize)

  // 2. Header
  push(0x1b, 0x61, 0x01); // Center align
  push(0x1b, 0x45, 0x01); // Bold on
  pushText("ANEKA JAYA / SLM\n");
  push(0x1b, 0x45, 0x00); // Bold off
  pushText("SURAT JALAN PENGIRIMAN (DO)\n");
  pushText("=".repeat(THERMAL_80MM_WIDTH) + "\n\n");

  // 3. JUMBO NAMA CUSTOMER (DYNAMIC SCALING: Triple for <= 14 chars, Double for > 14 chars)
  pushText("********************************\n");
  pushText("TUJUAN / PELANGGAN:\n");
  const customerName = (detail.sale.customerName || "PELANGGAN").toUpperCase();
  // If short name (<= 14 chars), use Triple Width + Triple Height (0x22). Otherwise Double Width + Double Height (0x11).
  const fontScalingByte = customerName.length <= 14 ? 0x22 : 0x11;
  push(0x1d, 0x21, fontScalingByte); // GS ! n
  push(0x1b, 0x45, 0x01); // Bold on
  pushText(customerName + "\n");
  push(0x1d, 0x21, 0x00); // Normal size
  push(0x1b, 0x45, 0x00); // Bold off
  pushText("********************************\n\n");

  // 4. LARGE NO INVOICE & NO DO (Double Width + Double Height)
  push(0x1d, 0x21, 0x11); // GS ! 0x11 (2x Width + 2x Height)
  push(0x1b, 0x45, 0x01); // Bold on
  const invNumber = detail.sale.transactionNumber || detail.doNumber;
  pushText(`INV: ${invNumber}\n`);
  push(0x1d, 0x21, 0x00); // Reset to normal font
  push(0x1b, 0x45, 0x00); // Bold off
  pushText(`DO: ${detail.doNumber}\n`);
  pushText("-".repeat(THERMAL_80MM_WIDTH) + "\n");

  // 5. Delivery Details (Left aligned)
  push(0x1b, 0x61, 0x00); // Left align
  const tanggalKirim = detail.sale.deliveryAt ? formatJakartaDate(detail.sale.deliveryAt) : formatJakartaDate(detail.sale.saleDate);
  pushText(`Tanggal Kirim : ${tanggalKirim}\n`);
  pushText(`Ekspedisi/Tipe: ${detail.sale.shippingMethod || "Kurir Toko"}\n`);
  pushText(`Alamat Tujuan : ${detail.sale.customerLocation || "-"}\n`);
  if (detail.trackingNumber) {
    pushText(`Nomor Resi    : ${detail.trackingNumber}\n`);
  }
  const driverName = detail.shippedByNameSnapshot || detail.assignedUserName || "-";
  pushText(`Petugas/Kurir : ${driverName}\n`);

  // 6. Items Table (Masked: No prices)
  pushText("-".repeat(THERMAL_80MM_WIDTH) + "\n");
  push(0x1b, 0x45, 0x01); // Bold
  pushText(twoColumn("RINCIAN BARANG", "LOKASI RAK") + "\n");
  push(0x1b, 0x45, 0x00); // Bold off
  pushText("-".repeat(THERMAL_80MM_WIDTH) + "\n");

  let totalQty = 0;
  detail.items.forEach((item, idx) => {
    totalQty += item.quantity;
    const no = `${idx + 1}.`;
    const namePart = item.productNameSnapshot || item.productRef || "Item";
    const qtyPart = `${item.quantity} ${item.unitSnapshot || "PCS"}`;
    const rackPart = item.rackNameSnapshot || item.warehouseNameSnapshot || "-";

    push(0x1b, 0x45, 0x01);
    pushText(`${padOrTruncate(no, 3)} ${namePart}\n`);
    push(0x1b, 0x45, 0x00);
    pushText(twoColumn(`    Qty: ${qtyPart}`, `Rak: ${rackPart}`) + "\n");
  });

  pushText("-".repeat(THERMAL_80MM_WIDTH) + "\n");
  push(0x1b, 0x45, 0x01);
  pushText(twoColumn(`TOTAL: ${detail.items.length} Macam Barang`, `Total Unit: ${totalQty}`) + "\n");
  push(0x1b, 0x45, 0x00);
  pushText("-".repeat(THERMAL_80MM_WIDTH) + "\n");

  if (detail.notes) {
    pushText(`Catatan: ${detail.notes}\n`);
    pushText("-".repeat(THERMAL_80MM_WIDTH) + "\n");
  }

  // 7. Signatures
  lineFeed();
  pushText("Tanda Tangan Serah Terima:\n\n");
  pushText(twoColumn("  Pengirim / Sopir", "  Penerima / Toko ") + "\n\n\n\n");
  pushText(twoColumn(" (................) ", " (................) ") + "\n\n");

  // 8. Footer
  push(0x1b, 0x61, 0x01); // Center align
  pushText("Harap periksa kelengkapan saat serah terima\n");
  pushText("=".repeat(THERMAL_80MM_WIDTH) + "\n\n");

  // 9. Feed & Cut
  push(0x1b, 0x64, 0x04); // Feed 4 lines
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
