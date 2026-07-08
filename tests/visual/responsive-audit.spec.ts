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
    externalId: "responsive-audit-owner",
    name: "Responsive Audit Owner",
    role: "OWNER",
    exp: Math.floor(Date.now() / 1000) + 60 * 30
  })).toString("base64url");
  const signature = createHmac("sha256", envValue("AUTH_SESSION_SECRET", "visual-secret")).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

const routes = [
  "/dashboard",
  "/penjualan/input",
  "/penjualan",
  "/pengeluaran/input",
  "/pengeluaran",
  "/barang",
  "/stok-barang",
  "/reports",
  "/reports/finance",
  "/approval",
  "/tempo",
  "/erp-sync",
  "/audit-trail",
  "/settings",
  "/settings/profit-slm",
  "/settings/rekening",
  "/settings/tipe",
  "/settings/users",
  "/settings/whatsapp",
  "/profile"
];

test("all operational pages remain usable within the viewport", async ({ page }, testInfo) => {
  await page.context().addCookies([{
    name: "aneka_jaya_session",
    value: ownerSessionCookie(),
    url: "http://127.0.0.1:3010",
    httpOnly: true,
    sameSite: "Lax"
  }]);

  const findings: Array<{ route: string; documentOverflow: number; exposedControls: string[] }> = [];
  for (const route of routes) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${route} should load`).toBe(200);

    const metrics = await page.evaluate(() => {
      const viewportWidth = window.innerWidth;
      const exposedControls = Array.from(document.querySelectorAll<HTMLElement>("a, button, input, select, textarea, summary"))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          if (element.closest("details:not([open])")) return false;
          if (rect.left >= -1 && rect.right <= viewportWidth + 1) return false;
          let parent = element.parentElement;
          while (parent) {
            const overflowX = getComputedStyle(parent).overflowX;
            if ((overflowX === "auto" || overflowX === "scroll") && parent.scrollWidth > parent.clientWidth) return false;
            parent = parent.parentElement;
          }
          return true;
        })
        .slice(0, 8)
        .map((element) => element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 60) || element.tagName);
      return {
        documentOverflow: Math.max(0, document.documentElement.scrollWidth - viewportWidth),
        exposedControls
      };
    });
    findings.push({ route, ...metrics });
  }

  console.log(`[responsive-audit:${testInfo.project.name}] ${JSON.stringify(findings)}`);
  expect(findings.filter((item) => item.documentOverflow > 1)).toEqual([]);
});
