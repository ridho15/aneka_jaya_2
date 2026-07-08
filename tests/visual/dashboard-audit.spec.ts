import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
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
    externalId: "visual-owner",
    name: "Visual Owner",
    role: "OWNER",
    exp: Math.floor(Date.now() / 1000) + 60 * 30
  })).toString("base64url");
  const signature = createHmac("sha256", envValue("AUTH_SESSION_SECRET", "visual-secret")).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function auditReport() {
  const output = execFileSync("node", ["scripts/audit-dashboard-values.mjs", "--json"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8"
  });
  return JSON.parse(output) as {
    kpis: {
      omzetMonth: { formatted: string };
      omzetToday: { formatted: string };
      receivedMonth: { formatted: string };
    };
    paymentBreakdown: { rows: Array<{ label: string; formatted: string }> };
    performance: Array<{ key: string; sales: number; expenses: number }>;
    slmProfit: {
      grossProfitPercent: number;
      formatted: {
        monthlyRevenue: string;
        monthlyExpenses: string;
        todayRevenue: string;
        todayExpenses: string;
        grossProfit: string;
        nettProfit: string;
      };
    };
  };
}

test.skip(process.env.AUDIT_DASHBOARD_BROWSER !== "1", "Set AUDIT_DASHBOARD_BROWSER=1 to compare dashboard UI against database audit values.");

test("dashboard rendered values match read-only audit report", async ({ page }) => {
  const expected = auditReport();
  await page.context().addCookies([{
    name: "aneka_jaya_session",
    value: ownerSessionCookie(),
    url: "http://127.0.0.1:3010",
    httpOnly: true,
    sameSite: "Lax"
  }]);

  await page.goto("/dashboard", { waitUntil: "networkidle" });

  await expect(page.getByTestId("dashboard-kpi-omzet-month")).toContainText(expected.kpis.omzetMonth.formatted);
  await expect(page.getByTestId("dashboard-kpi-omzet-today")).toContainText(expected.kpis.omzetToday.formatted);
  await expect(page.getByTestId("dashboard-kpi-received-month")).toContainText(expected.kpis.receivedMonth.formatted);
  await expect(page.getByTestId("dashboard-kpi-slm-month-revenue")).toContainText(expected.slmProfit.formatted.monthlyRevenue);
  await expect(page.getByTestId("dashboard-kpi-slm-month-expenses")).toContainText(expected.slmProfit.formatted.monthlyExpenses);
  await expect(page.getByTestId("dashboard-kpi-slm-today-revenue")).toContainText(expected.slmProfit.formatted.todayRevenue);
  await expect(page.getByTestId("dashboard-kpi-slm-today-expenses")).toContainText(expected.slmProfit.formatted.todayExpenses);
  await expect(page.getByTestId("dashboard-kpi-slm-gross-profit")).toContainText(expected.slmProfit.formatted.grossProfit);
  await expect(page.getByTestId("dashboard-kpi-slm-gross-profit")).toContainText(`Gross Profit ${expected.slmProfit.grossProfitPercent.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`);
  await expect(page.getByTestId("dashboard-kpi-slm-nett-profit")).toContainText(expected.slmProfit.formatted.nettProfit);

  const actualPaymentRows = await page.getByTestId("dashboard-payment-breakdown-row").evaluateAll((rows) => rows.map((row) => ({
    label: row.getAttribute("data-label"),
    formatted: row.getAttribute("data-value")
  })));
  expect(actualPaymentRows).toEqual(expected.paymentBreakdown.rows.map((row) => ({ label: row.label, formatted: row.formatted })));

  const actualPerformance = JSON.parse(await page.getByTestId("dashboard-performance-chart").getAttribute("data-performance") || "[]") as Array<{ key: string; sales: number; expenses: number }>;
  expect(actualPerformance.map((row) => ({ key: row.key, sales: row.sales, expenses: row.expenses }))).toEqual(expected.performance.map((row) => ({ key: row.key, sales: row.sales, expenses: row.expenses })));
});
