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
    externalId: "professional-mobile-owner",
    name: "Professional Mobile Owner",
    role: "OWNER",
    exp: Math.floor(Date.now() / 1000) + 60 * 30
  })).toString("base64url");
  const signature = createHmac("sha256", envValue("AUTH_SESSION_SECRET", "visual-secret")).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{
    name: "aneka_jaya_session",
    value: ownerSessionCookie(),
    url: "http://127.0.0.1:3010",
    httpOnly: true,
    sameSite: "Lax"
  }]);
});

test("report, audit, and ERP pages expose mobile card surfaces without overflow", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile card polish is asserted on the mobile project.");

  const routes = [
    { route: "/reports", testIds: ["reports-mobile-cards"] },
    { route: "/reports/finance", testIds: ["finance-tempo-mobile-cards", "finance-expense-mobile-cards"] },
    { route: "/audit-trail", testIds: ["audit-mobile-cards"] },
    { route: "/erp-sync", testIds: ["erp-sales-mobile-cards", "erp-expense-mobile-cards"] }
  ];

  for (const { route, testIds } of routes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    for (const testId of testIds) await expect(page.getByTestId(testId)).toBeAttached();
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
    expect(overflow, `${route} should not overflow horizontally`).toBe(0);
  }
});

test("desktop report, audit, and ERP pages keep table views", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop table preservation is asserted outside the mobile project.");

  for (const route of ["/reports", "/reports/finance", "/audit-trail", "/erp-sync"]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("table").first()).toBeVisible();
  }
});
