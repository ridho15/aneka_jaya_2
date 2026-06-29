import { expect, test } from "@playwright/test";

test.describe("login visual QA", () => {
  test("/login renders focused operational login without overflow", async ({ page }, testInfo) => {
    await page.goto("/login", { waitUntil: "networkidle" });

    await expect(page.locator("body")).toContainText("LSM Internal App");
    await expect(page.getByRole("heading", { name: "Masuk ke sistem" })).toBeVisible();
    await expect(page.getByLabel("Email atau username")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Masuk ke Sistem" })).toBeVisible();
    await expect(page.getByText("Hubungi Super Admin jika tidak bisa masuk.")).toBeVisible();

    for (const text of [
      "Internal Operations",
      "Role-based Access",
      "ERP-ready",
      "Login internal aktif",
      "Mode aplikasi",
      "Role aktif",
      "SSO",
      "Pilih role demo"
    ]) {
      await expect(page.getByText(text, { exact: false })).toHaveCount(0);
    }

    for (const moduleName of ["Penjualan", "Tempo", "Approval", "Stok", "Laporan"]) {
      await expect(page.locator("h2", { hasText: moduleName })).toHaveCount(0);
    }

    const metrics = await page.evaluate(() => {
      const form = document.querySelector("form");
      const formRect = form?.getBoundingClientRect();
      const submit = document.querySelector('button[type="submit"]');
      const submitClasses = submit?.getAttribute("class") || "";
      const monogramClasses = Array.from(document.querySelectorAll("span"))
        .find((element) => element.textContent === "LSM" && element.getAttribute("class")?.includes("bg-emerald"))
        ?.getAttribute("class") || "";
      return {
        innerWidth,
        innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        formTop: formRect?.top ?? null,
        formBottom: formRect?.bottom ?? null,
        submitClasses,
        monogramClasses
      };
    });

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(metrics.formTop).not.toBeNull();
    expect(metrics.formTop || 0).toBeLessThan(metrics.innerHeight);
    expect(metrics.formBottom || 0).toBeLessThan(metrics.innerHeight + 220);
    expect(metrics.submitClasses).toContain("bg-emerald-600");
    expect(metrics.submitClasses).not.toContain("bg-neutral-900");
    expect(metrics.monogramClasses).toContain("bg-emerald-600");

    await page.screenshot({
      path: testInfo.outputPath(`${testInfo.project.name}-login.png`),
      fullPage: true
    });
  });
});
