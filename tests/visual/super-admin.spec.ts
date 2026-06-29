import { expect, test } from "@playwright/test";

test("Super Admin can open the complete operational navigation without simulated data", async ({ page }) => {
  await page.setExtraHTTPHeaders({
    "x-aneka-auth-secret": "visual-secret",
    "x-aneka-user-id": "visual-owner",
    "x-aneka-user-role": "OWNER"
  });
  await page.goto("/dashboard", { waitUntil: "networkidle" });

  await expect(page.getByText("Super Admin", { exact: true }).first()).toBeVisible();
  for (const href of [
    "/dashboard", "/penjualan/input", "/pengeluaran/input", "/barang",
    "/reports", "/reports/finance", "/approval", "/tempo", "/erp-sync", "/audit-trail", "/settings"
  ]) {
    await expect(page.locator(`nav a[href="${href}"]`)).toHaveCount(1);
  }
  await expect(page.locator('nav a[href^="/pembelian"]')).toHaveCount(0);
  await expect(page.getByText("Konfigurasi ERP belum lengkap.", { exact: true })).toBeVisible();
  await expect(page.getByText(/mock/i)).toHaveCount(0);

  const purchaseResponse = await page.goto("/pembelian/input", { waitUntil: "networkidle" });
  expect(purchaseResponse?.status()).toBe(404);
});
