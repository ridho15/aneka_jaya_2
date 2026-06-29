import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

function envValue(key: string, fallback: string) {
  if (process.env[key]) return process.env[key] as string;
  if (!existsSync(".env.local")) return fallback;
  const line = readFileSync(".env.local", "utf8").split(/\r?\n/).find((item) => item.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim() || fallback;
}

function visualSessionCookie() {
  const payload = Buffer.from(JSON.stringify({
    externalId: "visual-owner",
    name: "Visual Owner",
    role: "OWNER",
    exp: Math.floor(Date.now() / 1000) + 60 * 30
  })).toString("base64url");
  const signature = createHmac("sha256", envValue("AUTH_SESSION_SECRET", "visual-secret")).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

test("Super Admin can open the complete operational navigation without simulated data", async ({ page }) => {
  await page.context().addCookies([{
    name: "aneka_jaya_session",
    value: visualSessionCookie(),
    url: "http://127.0.0.1:3010",
    httpOnly: true,
    sameSite: "Lax"
  }]);
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
  await expect(page.locator('nav a[href="/dashboard"]')).toHaveClass(/bg-emerald-600/);
  await expect(page.locator('nav a[href="/dashboard"]')).not.toHaveClass(/bg-blue-600/);

  const purchaseResponse = await page.goto("/pembelian/input", { waitUntil: "networkidle" });
  expect(purchaseResponse?.status()).toBe(404);
});

test("Input Penjualan exposes dependency failures and stays within the viewport", async ({ page }) => {
  await page.context().addCookies([{
    name: "aneka_jaya_session",
    value: visualSessionCookie(),
    url: "http://127.0.0.1:3010",
    httpOnly: true,
    sameSite: "Lax"
  }]);

  const response = await page.goto("/penjualan/input", { waitUntil: "networkidle" });

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Input Penjualan" })).toBeVisible();
  await expect(page.getByText("Produk gagal dimuat")).toBeVisible();
  await expect(page.getByRole("button", { name: "Muat ulang" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Simpan Penjualan" })).toBeDisabled();
  await expect(page.getByLabel("Tipe")).toHaveValue("W");
  await expect(page.getByLabel("Rekening penerima")).toHaveValue("cash-w");
  await page.getByLabel("Tipe").selectOption("AJ");
  await expect(page.getByLabel("Transaksi pengujian", { exact: false })).toBeVisible();
  const accountMenu = page.locator("summary");
  await expect(accountMenu).toHaveCount(1);
  await accountMenu.click();
  await expect(page.locator('a[href="/profile"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);

  const profileResponse = await page.goto("/profile", { waitUntil: "networkidle" });
  expect(profileResponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Profil" })).toBeVisible();
});
