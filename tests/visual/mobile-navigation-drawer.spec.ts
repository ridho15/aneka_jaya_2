import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

function envValue(key: string, fallback: string) {
  if (process.env[key]) return process.env[key] as string;
  if (!existsSync(".env.local")) return fallback;
  const line = readFileSync(".env.local", "utf8").split(/\r?\n/).find((item) => item.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim() || fallback;
}

function ownerSessionCookie() {
  const payload = Buffer.from(JSON.stringify({
    externalId: "mobile-drawer-owner",
    name: "Mobile Drawer Owner",
    role: "OWNER",
    exp: Math.floor(Date.now() / 1000) + 60 * 30
  })).toString("base64url");
  const signature = createHmac("sha256", envValue("AUTH_SESSION_SECRET", "visual-secret")).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

test("mobile drawer opens, navigates, and closes", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile drawer is only rendered below the desktop breakpoint.");

  await page.context().addCookies([{
    name: "aneka_jaya_session",
    value: ownerSessionCookie(),
    url: "http://127.0.0.1:3010",
    httpOnly: true,
    sameSite: "Lax"
  }]);

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Buka menu")).toBeVisible();
  await expect(page.locator("#mobile-navigation-drawer")).toHaveCount(0);

  await page.getByLabel("Buka menu").click();
  await expect(page.locator("#mobile-navigation-drawer")).toBeVisible();
  await expect(page.locator("#mobile-navigation-drawer").getByRole("link", { name: /Riwayat Penjualan/ })).toBeVisible();

  await page.locator("#mobile-navigation-drawer").getByRole("link", { name: /Riwayat Penjualan/ }).click();
  await expect(page).toHaveURL(/\/penjualan$/);
  await expect(page.locator("#mobile-navigation-drawer")).toHaveCount(0);

  await page.getByLabel("Buka menu").click();
  await expect(page.locator("#mobile-navigation-drawer")).toBeVisible();
  await page.getByRole("button", { name: "Tutup menu", exact: true }).click();
  await expect(page.locator("#mobile-navigation-drawer")).toHaveCount(0);

  await page.getByLabel("Buka menu").click();
  await expect(page.locator("#mobile-navigation-drawer")).toBeVisible();
  await page.getByLabel("Tutup overlay menu").click({ position: { x: 360, y: 20 } });
  await expect(page.locator("#mobile-navigation-drawer")).toHaveCount(0);
});
