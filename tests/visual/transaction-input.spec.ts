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
    externalId: "visual-owner",
    name: "Visual Owner",
    role: "OWNER",
    exp: Math.floor(Date.now() / 1000) + 60 * 30
  })).toString("base64url");
  const signature = createHmac("sha256", envValue("AUTH_SESSION_SECRET", "visual-secret")).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function loginAsOwner(page: import("@playwright/test").Page) {
  await page.context().addCookies([{
    name: "aneka_jaya_session",
    value: ownerSessionCookie(),
    url: "http://127.0.0.1:3010",
    httpOnly: true,
    sameSite: "Lax"
  }]);
}

async function mockProductsReady(page: import("@playwright/test").Page) {
  await page.route("**/api/products**", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [{
          id: "ERP-P-1",
          code: "BRG-001",
          name: "Barang ERP Contoh",
          category: "Aksesoris",
          sellingPrice: 25000,
          minimumStock: 0,
          isActive: true,
          updatedAt: "2026-06-29T10:00:00.000Z"
        }]
      })
    });
  });
}

async function mockStocksReady(page: import("@playwright/test").Page) {
  await page.route("**/api/stocks**", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [{
          id: "ST-1",
          productCode: "BRG-001",
          productName: "Barang ERP Contoh",
          warehouse: "Toko",
          quantity: 8,
          minimumStock: 2,
          unit: "PCS"
        }]
      })
    });
  });
}

async function mockProductReferencesReady(page: import("@playwright/test").Page) {
  await page.route("**/api/product-references", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          categories: [{ id: 5, name: "QA Category", code: "QA" }],
          uoms: [{ id: 2, name: "PCS", code: "PCS" }]
        }
      })
    });
  });
}

test("Input Penjualan can submit a local SLM transaction with ERP product data", async ({ page }) => {
  await loginAsOwner(page);
  await mockProductsReady(page);
  await mockStocksReady(page);
  const submitted: unknown[] = [];
  await page.route("**/api/sales", async (route) => {
    submitted.push(await route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { id: "S-E2E-LOCAL", target: "local", approvalStatus: "approved" }
      })
    });
  });

  await page.goto("/penjualan/input", { waitUntil: "networkidle" });
  await expect(page.getByText("Produk ERP siap digunakan.")).toBeVisible();
  await expect(page.getByText("Sistem SLM")).toBeVisible();

  await page.getByRole("textbox", { name: "Nama customer" }).fill("Customer E2E Lokal");
  await page.getByRole("combobox", { name: "Barang" }).fill("BRG");
  await page.getByRole("option", { name: /BRG-001/ }).click();
  await expect(page.getByText(/Stok ERP:\s*8/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Harga" })).toHaveValue("25.000");
  await page.getByRole("spinbutton", { name: "Qty" }).fill("2");
  await expect(page.getByText(/Rp\s?50\.000/).first()).toBeVisible();
  await page.getByRole("button", { name: "Simpan Penjualan" }).click();

  await expect(page.getByText("Data penjualan berhasil disimpan di sistem SLM.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Cetak Penjualan" })).toHaveAttribute("href", "/print/sales/S-E2E-LOCAL");
  expect(submitted).toHaveLength(1);
  expect(submitted[0]).toMatchObject({
    tipeId: "W",
    customerName: "Customer E2E Lokal",
    items: [{ productRef: "BRG-001", quantity: 2, unitPrice: 25000 }]
  });
});

test("Input Penjualan can submit an AJ transaction without touching the live ERP in E2E", async ({ page }) => {
  await loginAsOwner(page);
  await mockProductsReady(page);
  await mockStocksReady(page);
  const submitted: unknown[] = [];
  await page.route("**/api/sales", async (route) => {
    submitted.push(await route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { id: "S-E2E-AJ", target: "erp", approvalStatus: "approved", syncStatus: "synced", erpReference: "ERP-E2E-1" }
      })
    });
  });

  await page.goto("/penjualan/input", { waitUntil: "networkidle" });
  await page.getByLabel("Tipe").selectOption("AJ");
  await expect(page.getByText("Aneka Jaya ERP", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Rekening penerima")).toHaveValue("cash-aj");

  await page.getByRole("textbox", { name: "Nama customer" }).fill("Customer E2E AJ");
  await page.getByRole("combobox", { name: "Barang" }).fill("Barang ERP");
  await page.getByRole("option", { name: /BRG-001/ }).click();
  await page.getByRole("spinbutton", { name: "Qty" }).fill("1");
  await page.getByRole("button", { name: "Simpan Penjualan" }).click();

  await expect(page.getByText("Data penjualan berhasil dikirim ke Aneka Jaya ERP.")).toBeVisible();
  await expect(page.getByText("ERP-E2E-1")).toBeVisible();
  expect(submitted).toHaveLength(1);
  expect(submitted[0]).toMatchObject({
    tipeId: "AJ",
    tipeCodeSnapshot: "AJ",
    rekeningId: "cash-aj",
    customerName: "Customer E2E AJ",
    items: [{ productRef: "BRG-001", quantity: 1, unitPrice: 25000 }]
  });
});

test("Input Penjualan can submit mixed ERP and manual products in one AJ transaction", async ({ page }) => {
  await loginAsOwner(page);
  await mockProductsReady(page);
  await mockStocksReady(page);
  await mockProductReferencesReady(page);
  const submitted: unknown[] = [];
  await page.route("**/api/sales", async (route) => {
    submitted.push(await route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { id: "S-E2E-MIXED-AJ", target: "erp", approvalStatus: "approved", syncStatus: "synced", erpReference: "ERP-E2E-MIXED" }
      })
    });
  });

  await page.goto("/penjualan/input", { waitUntil: "networkidle" });
  await page.getByLabel("Tipe").selectOption("AJ");
  await page.getByRole("textbox", { name: "Nama customer" }).fill("Customer Mixed AJ");

  await page.getByRole("combobox", { name: "Barang" }).fill("BRG");
  await page.getByRole("option", { name: /BRG-001/ }).click();
  await page.getByRole("spinbutton", { name: "Qty" }).fill("2");
  await page.getByLabel("Diskon (%)").fill("10");

  await page.getByRole("button", { name: "+ Tambah barang" }).click();
  await page.getByRole("button", { name: "Barang baru/manual" }).last().click();
  await page.getByRole("button", { name: "Generate SKU" }).click();
  await expect(page.getByPlaceholder("SKU produk baru").last()).toHaveValue(/^SLM-AJ-\d{10}-[A-Z0-9]{4}$/);
  await page.getByPlaceholder("Nama produk baru").fill("QA Mixed Manual Product");
  await page.getByLabel("Harga modal").fill("500");
  await page.getByPlaceholder("Contoh: UMUM").fill("UMUM");
  await page.getByLabel("Harga jual ERP").fill("1.000");
  await page.getByLabel("Kategori ERP").selectOption("5");
  await page.getByLabel("Satuan ERP").selectOption("2");

  await page.getByRole("button", { name: "Simpan Penjualan" }).click();

  await expect(page.getByText("Data penjualan berhasil dikirim ke Aneka Jaya ERP.")).toBeVisible();
  expect(submitted).toHaveLength(1);
  expect(submitted[0]).toMatchObject({
    tipeId: "AJ",
    customerName: "Customer Mixed AJ",
    items: [
      expect.objectContaining({ productRef: "BRG-001", quantity: 2, unitPrice: 25000, discount: 5000 }),
      expect.objectContaining({
        productInputMode: "manual",
        quantity: 1,
        unitPrice: 1000,
        discount: 0,
        manualProduct: expect.objectContaining({
          name: "QA Mixed Manual Product",
          productCategoryId: 5,
          uomId: 2,
          brandCode: "UMUM",
          costPrice: 500,
          sellingPrice: 1000
        })
      })
    ]
  });
});

test("Input Penjualan blocks submit when ERP products fail to load", async ({ page }) => {
  await loginAsOwner(page);
  await page.route("**/api/products**", async (route) => {
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ success: false, message: "ERP produk gagal.", code: "ERP_UPSTREAM" })
    });
  });
  await mockStocksReady(page);

  await page.goto("/penjualan/input", { waitUntil: "networkidle" });

  await expect(page.getByText("Produk gagal dimuat", { exact: true })).toBeVisible();
  await expect(page.getByText("ERP produk gagal.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Simpan Penjualan" })).toBeDisabled();
});

test("Input Penjualan keeps product selection usable when ERP stock fails", async ({ page }) => {
  await loginAsOwner(page);
  await mockProductsReady(page);
  const submitted: unknown[] = [];
  await page.route("**/api/stocks**", async (route) => {
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ success: false, message: "ERP stok gagal.", code: "ERP_UPSTREAM" })
    });
  });
  await page.route("**/api/sales", async (route) => {
    submitted.push(await route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { id: "S-E2E-STOCK-FAILED", target: "local", approvalStatus: "approved" } })
    });
  });

  await page.goto("/penjualan/input", { waitUntil: "networkidle" });
  await expect(page.getByText("ERP stok gagal.")).toBeVisible();
  await page.getByRole("combobox", { name: "Barang" }).fill("BRG");
  await page.getByRole("option", { name: /BRG-001/ }).click();
  await expect(page.getByText("Stok tidak terverifikasi")).toBeVisible();
  await page.getByRole("button", { name: "Simpan Penjualan" }).click();

  await expect(page.getByText("Data penjualan berhasil disimpan di sistem SLM.")).toBeVisible();
  expect(submitted[0]).toMatchObject({ items: [{ productRef: "BRG-001", unitPrice: 25000 }] });
});

test("Input Penjualan keeps a local draft when submit fails", async ({ page }) => {
  await loginAsOwner(page);
  await mockProductsReady(page);
  await mockStocksReady(page);
  await page.route("**/api/sales", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ success: false, message: "Simulasi gagal submit." })
    });
  });

  await page.goto("/penjualan/input", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Nama customer" }).fill("Customer Draft E2E");
  await page.getByRole("combobox", { name: "Barang" }).fill("BRG");
  await page.getByRole("option", { name: /BRG-001/ }).click();
  await page.getByRole("spinbutton", { name: "Qty" }).fill("1");
  await page.getByRole("button", { name: "Simpan Penjualan" }).click();

  await expect(page.getByText("Simulasi gagal submit.")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("aneka-jaya-draft-penjualan"))).toContain("Customer Draft E2E");
});
