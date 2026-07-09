import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

function envValue(key: string, fallback: string) {
  if (process.env[key]) return process.env[key] as string;
  if (!existsSync(".env.local")) return fallback;
  const line = readFileSync(".env.local", "utf8").split(/\r?\n/).find((item) => item.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim() || fallback;
}

function ownerSessionCookie() {
  const payload = Buffer.from(JSON.stringify({
    externalId: "read-only-app-audit-owner",
    name: "Read-only Audit Owner",
    role: "OWNER",
    exp: Math.floor(Date.now() / 1000) + 60 * 30
  })).toString("base64url");
  const signature = createHmac("sha256", envValue("AUTH_SESSION_SECRET", "visual-secret")).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

const routes = [
  { path: "/dashboard", slug: "dashboard" },
  { path: "/penjualan/input", slug: "input-penjualan" },
  { path: "/penjualan", slug: "riwayat-penjualan" },
  { path: "/reports", slug: "laporan" },
  { path: "/reports/finance", slug: "laporan-finance" },
  { path: "/audit-trail", slug: "audit-trail" },
  { path: "/erp-sync", slug: "erp-sync" }
];

type Finding = {
  route: string;
  severity: "high" | "medium";
  category: "overflow" | "clipping" | "overlap";
  detail: string;
};

async function visualMetrics(page: Page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const selector = "a, button, input, select, textarea, summary";
    const controls = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((element) => {
      if (element.closest("details:not([open])") && element.tagName !== "SUMMARY") return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
    const name = (element: HTMLElement) => element.getAttribute("aria-label") || element.textContent?.trim().replace(/\s+/g, " ").slice(0, 60) || element.tagName;
    const clippedControls = controls.filter((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.left >= -1 && rect.right <= viewportWidth + 1) return false;
      let parent = element.parentElement;
      while (parent) {
        const overflowX = getComputedStyle(parent).overflowX;
        if ((overflowX === "auto" || overflowX === "scroll") && parent.scrollWidth > parent.clientWidth) return false;
        parent = parent.parentElement;
      }
      return true;
    }).map(name).slice(0, 10);
    const overlapPairs: string[] = [];
    for (let first = 0; first < controls.length; first += 1) {
      const a = controls[first];
      const aRect = a.getBoundingClientRect();
      if (aRect.bottom < 0 || aRect.top > viewportHeight) continue;
      for (let second = first + 1; second < controls.length; second += 1) {
        const b = controls[second];
        if (a.contains(b) || b.contains(a)) continue;
        const bRect = b.getBoundingClientRect();
        const overlapWidth = Math.min(aRect.right, bRect.right) - Math.max(aRect.left, bRect.left);
        const overlapHeight = Math.min(aRect.bottom, bRect.bottom) - Math.max(aRect.top, bRect.top);
        if (overlapWidth > 6 && overlapHeight > 6) overlapPairs.push(`${name(a)} <> ${name(b)}`);
        if (overlapPairs.length >= 10) break;
      }
      if (overlapPairs.length >= 10) break;
    }
    return {
      documentOverflow: Math.max(0, document.documentElement.scrollWidth - viewportWidth),
      clippedControls,
      overlapPairs
    };
  });
}

async function assertRouteSemantics(page: Page, route: string, drawerNavigation: boolean, mobileCards: boolean) {
  if (drawerNavigation) {
    await expect(page.getByRole("button", { name: "Buka menu" })).toBeVisible();
  } else {
    await expect(page.getByRole("navigation").first()).toBeVisible();
  }

  if (route === "/dashboard") {
    await expect(page.getByTestId("dashboard-performance-chart")).toBeVisible();
    await expect(page.getByTestId("dashboard-payment-breakdown")).toBeVisible();
    await expect(page.getByTestId("dashboard-kpi-operational-gross-profit")).toBeVisible();
  }
  if (route === "/penjualan/input") {
    const save = page.getByRole("button", { name: "Simpan Penjualan" });
    await expect(save).toBeAttached();
    await page.getByText("Cash", { exact: true }).click();
    await expect(page.locator('input[name="paymentMethod"][value="Cash"]')).toBeChecked();
    await page.getByText("TF", { exact: true }).click();
    await expect(page.locator('input[name="paymentMethod"][value="TF"]')).toBeChecked();
    await expect(page.locator("form")).not.toHaveAttribute("data-submitted", "true");
  }
  if (route === "/penjualan") {
    if (mobileCards) await expect(page.getByTestId("sales-mobile-cards")).toBeVisible();
    else await expect(page.locator("table")).toBeVisible();
  }
  if (route === "/reports") {
    if (mobileCards) await expect(page.getByTestId("reports-mobile-cards")).toBeVisible();
    else await expect(page.locator("table")).toBeVisible();
  }
  if (route === "/reports/finance") {
    if (mobileCards) {
      await expect(page.getByTestId("finance-tempo-mobile-cards")).toBeVisible();
      await expect(page.getByTestId("finance-expense-mobile-cards")).toBeVisible();
    } else await expect(page.locator("table").first()).toBeVisible();
  }
  if (route === "/audit-trail") {
    if (mobileCards) await expect(page.getByTestId("audit-mobile-cards")).toBeVisible();
    else await expect(page.locator("table")).toBeVisible();
  }
  if (route === "/erp-sync") {
    if (mobileCards) {
      await expect(page.getByTestId("erp-sales-mobile-cards")).toBeVisible();
      await expect(page.getByTestId("erp-expense-mobile-cards")).toBeVisible();
    } else await expect(page.locator("table").first()).toBeVisible();
  }
}

async function saveAuditArtifacts(page: Page, testInfo: TestInfo, slug: string) {
  const screenshotPath = testInfo.outputPath(`${slug}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach(`${slug}-${testInfo.project.name}`, { path: screenshotPath, contentType: "image/png" });
}

test("read-only operational UX audit", async ({ page }, testInfo) => {
  await page.context().addCookies([{
    name: "aneka_jaya_session",
    value: ownerSessionCookie(),
    url: "http://127.0.0.1:3010",
    httpOnly: true,
    sameSite: "Lax"
  }]);

  let mutationRequests = 0;
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) mutationRequests += 1;
  });

  const findings: Finding[] = [];
  const drawerNavigation = testInfo.project.name !== "desktop";
  const mobileCards = testInfo.project.name === "mobile";
  for (const route of routes) {
    const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${route.path} should load`).toBe(200);
    await assertRouteSemantics(page, route.path, drawerNavigation, mobileCards);
    const metrics = await visualMetrics(page);
    if (metrics.documentOverflow > 1) findings.push({ route: route.path, severity: "high", category: "overflow", detail: `${metrics.documentOverflow}px document overflow` });
    for (const item of metrics.clippedControls) findings.push({ route: route.path, severity: "high", category: "clipping", detail: item });
    for (const item of metrics.overlapPairs) findings.push({ route: route.path, severity: "medium", category: "overlap", detail: item });
    await saveAuditArtifacts(page, testInfo, route.slug);
  }

  const report = {
    status: findings.length === 0 && mutationRequests === 0 ? "PASS" : "FAIL",
    project: testInfo.project.name,
    viewport: testInfo.project.use.viewport,
    auditedAt: new Date().toISOString(),
    readOnly: mutationRequests === 0,
    mutationRequests,
    routes: routes.map((route) => route.path),
    findings
  };
  const reportPath = testInfo.outputPath("audit-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  await testInfo.attach(`audit-report-${testInfo.project.name}`, { path: reportPath, contentType: "application/json" });
  console.log(`[read-only-app-audit:${testInfo.project.name}] ${JSON.stringify(report)}`);

  expect(mutationRequests, "Audit must not submit forms or trigger ERP retry").toBe(0);
  expect(findings.filter((item) => item.severity === "high")).toEqual([]);
  expect(findings.filter((item) => item.category === "overlap")).toEqual([]);
});
