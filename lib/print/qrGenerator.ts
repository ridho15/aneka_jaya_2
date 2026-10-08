import QRCode from "qrcode";
export { generateDeliveryOrderQrPayload } from "./thermalEscpos";

/**
 * Generates an SVG string representation of the QR Code.
 * Monochromatic 1-bit high contrast, suitable for thermal printers.
 */
export async function generateQrCodeSvg(text: string): Promise<string> {
  try {
    const svgString = await QRCode.toString(text, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: {
        dark: "#000000",
        light: "#ffffff"
      }
    });
    return svgString;
  } catch (err) {
    console.error("Failed to generate QR Code SVG:", err);
    return "";
  }
}

/**
 * Generates a base64 Data URL for the QR Code.
 */
export async function generateQrCodeDataUrl(text: string): Promise<string> {
  try {
    const dataUrl = await QRCode.toDataURL(text, {
      margin: 1,
      errorCorrectionLevel: "M",
      width: 280, // High-res 4x for 70mm sharp thermal output
      color: {
        dark: "#000000",
        light: "#ffffff"
      }
    });
    return dataUrl;
  } catch (err) {
    console.error("Failed to generate QR Code Data URL:", err);
    return "";
  }
}
