import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

function envValue(key: string, fallback: string) {
  if (process.env[key]) return process.env[key] as string;
  if (!existsSync(".env.local")) return fallback;
  const line = readFileSync(".env.local", "utf8").split(/\r?\n/).find((item) => item.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim() || fallback;
}

function visualSessionCookie(role: "OWNER" | "DELIVERY_DRIVER" = "OWNER") {
  const payload = Buffer.from(JSON.stringify({
    externalId: role === "OWNER" ? "slm-owner" : "driver-uat-01",
    name: role === "OWNER" ? "Owner" : "Budi (Petugas DO)",
    role,
    exp: Math.floor(Date.now() / 1000) + 60 * 30
  })).toString("base64url");
  const signature = createHmac("sha256", envValue("AUTH_SESSION_SECRET", "visual-secret")).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

test.describe("Delivery Order Proof Camera & Upload Visual Verification", () => {
  test("renders camera capture, viewfinder modal, and file upload buttons on DO detail", async ({ page, isMobile, baseURL }) => {
    const targetUrl = baseURL || "http://127.0.0.1:3001";

    await page.context().addCookies([
      {
        name: "aneka_jaya_session",
        value: visualSessionCookie("OWNER"),
        url: targetUrl,
        httpOnly: true,
        sameSite: "Lax"
      },
      {
        name: "aneka_jaya_erp_token",
        value: "dummy_erp_token",
        url: targetUrl,
        httpOnly: true,
        sameSite: "Lax"
      }
    ]);

    // Navigate to the test DO detail page
    const doId = "004effbf-3027-4b48-b145-9a0ebe91e737";
    await page.goto(`/delivery-orders/${doId}`, { waitUntil: "networkidle" });

    // 1. Verify card header
    await expect(page.getByRole("heading", { name: "Bukti Pengiriman (Foto Resi) & Catatan" })).toBeVisible();

    // 2. Verify both action buttons are present and visible
    const cameraBtn = page.getByRole("button", { name: "Foto Kamera" });
    const fileBtn = page.getByRole("button", { name: "Pilih dari File" });

    await expect(cameraBtn).toBeVisible();
    await expect(fileBtn).toBeVisible();
    await expect(page.getByRole("button", { name: "Buka Viewfinder" })).toHaveCount(0);

    // 3. Verify hidden inputs for native camera and gallery file picker
    const cameraInput = page.locator('input[aria-label="Ambil Foto Kamera Native"]');
    await expect(cameraInput).toHaveAttribute("type", "file");
    await expect(cameraInput).toHaveAttribute("accept", "image/*");
    await expect(cameraInput).toHaveAttribute("capture", "environment");

    const galleryInput = page.locator('input[aria-label="Upload File atau Galeri"]');
    await expect(galleryInput).toHaveAttribute("type", "file");
    await expect(galleryInput).toHaveAttribute("accept", "image/*,.pdf");

    // 4. Verify smart camera click behavior:
    if (!isMobile) {
      // Desktop / Tablet: opens live viewfinder modal directly
      await cameraBtn.click();
      await expect(page.getByRole("heading", { name: "Kamera Bukti Pengiriman" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Batal" })).toBeVisible();
      await page.getByRole("button", { name: "Batal" }).click();
      await expect(page.getByRole("heading", { name: "Kamera Bukti Pengiriman" })).toHaveCount(0);
    } else {
      // Mobile: triggers native camera file chooser
      const fileChooserPromise = page.waitForEvent("filechooser");
      await cameraBtn.click();
      const fileChooser = await fileChooserPromise;
      expect(fileChooser.isMultiple()).toBe(false);
    }
  });
});
