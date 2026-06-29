import { expect, test } from "@playwright/test";

const paths = ["/", "/login"];
const requiredText = [
  "Aneka Jaya Internal App",
  "Internal Operations",
  "Role-based Access",
  "ERP-ready",
  "Penjualan",
  "Tempo",
  "Approval",
  "Stok",
  "Laporan"
];

test.describe("landing and login visual QA", () => {
  for (const path of paths) {
    test(`${path} renders professional landing without overflow`, async ({ page }, testInfo) => {
      await page.goto(path, { waitUntil: "networkidle" });

      for (const text of requiredText) {
        await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
      }

      await expect(page.getByText("Pilih role demo", { exact: false })).toHaveCount(0);
      await expect(page.getByText("trusted header", { exact: false })).toHaveCount(0);
      await expect(page.getByText("reverse proxy", { exact: false })).toHaveCount(0);
      await expect(page.getByText("role database", { exact: false })).toHaveCount(0);

      if (path === "/login") {
        await expect(page.getByRole("button", { name: "Masuk ke Sistem belum tersedia" })).toBeDisabled();
        await expect(page.getByText("Login belum tersedia", { exact: true })).toBeVisible();
        await expect(page.getByText("SSO perusahaan belum dikonfigurasi. Hubungi operator sistem.", { exact: true })).toBeVisible();
        await expect(page.getByRole("link", { name: "Lihat status akses" })).toBeVisible();
      }

      const metrics = await page.evaluate(() => {
        const cta = Array.from(document.querySelectorAll("a,button")).find((element) =>
          /Pilih Role Development|Masuk ke Sistem|Lihat status akses/.test(element.textContent || "")
        );
        const ctaRect = cta?.getBoundingClientRect();
        return {
          innerWidth,
          innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          ctaTop: ctaRect?.top ?? null,
          emeraldElements: document.querySelectorAll('[class*="emerald"]').length,
          moduleCards: Array.from(document.querySelectorAll("h2")).filter((heading) =>
            ["Penjualan", "Tempo", "Approval", "Stok", "Laporan"].includes(heading.textContent || "")
          ).length
        };
      });

      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
      expect(metrics.ctaTop).not.toBeNull();
      expect(metrics.ctaTop || 0).toBeLessThan(metrics.innerHeight);
      expect(metrics.emeraldElements).toBeGreaterThan(8);
      expect(metrics.moduleCards).toBe(5);

      await page.screenshot({
        path: testInfo.outputPath(`${testInfo.project.name}-${path === "/" ? "root" : "login"}.png`),
        fullPage: true
      });
    });
  }
});
