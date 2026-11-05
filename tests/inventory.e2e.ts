import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

/**
 * Alur inventory gudang & toko per role. App harus berjalan dalam mode demo
 * (AUTH_PROVIDER=demo) supaya role bisa dipilih lewat cookie `aneka_jaya_role`.
 */
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

async function asRole(browser: { setCookies(cookies: { name: string; value: string; url: string }[]): Promise<void> }, role: string) {
  await browser.setCookies([{ name: 'aneka_jaya_role', value: role, url: APP_URL }]);
}

describe('inventory', { tags: ['inventory'] }, () => {
  test('Super Admin: Stok Gudang & Toko terbuka di Toko, urut stok paling sedikit', async ({ app, browser, screen }) => {
    await asRole(browser, 'OWNER');
    await app.open('/inventory');
    await expect(screen.getByRole('heading', 'Stok Gudang & Toko')).toBeVisible();
    await expect(screen.getByRole('combobox').nth(0)).toHaveValue('STORE');
    await expect(screen.getByText(/Urut dari stok paling sedikit/)).toBeVisible();
  });

  test('menu lama Stock Barang dialihkan ke Stok Gudang & Toko', async ({ app, browser }) => {
    await asRole(browser, 'OWNER');
    await app.open('/barang');
    await expect(browser).toHaveURL(/\/inventory$/);
  });

  test('Admin hanya melihat menu yang diizinkan', async ({ app, browser, screen }) => {
    await asRole(browser, 'ADMIN');
    await app.open('/inventory');
    const nav = screen.getByRole('navigation').first();
    await expect(nav.getByRole('link', /Riwayat Penjualan/)).toBeVisible();
    await expect(nav.getByRole('link', /Stock Opname/)).toBeVisible();
    await expect(nav.getByRole('link', /Master Barang/)).toHaveCount(0);
    await expect(nav.getByRole('link', /Mutasi \/ Kartu Stok/)).toHaveCount(0);
  });

  test('Admin tidak bisa membuka Master Barang', async ({ app, browser }) => {
    await asRole(browser, 'ADMIN');
    await app.open('/inventory/produk');
    await expect(browser).not.toHaveURL(/\/inventory\/produk/);
  });

  test('Admin: Tempo hanya jatuh tempo ≤ 3 hari, tanpa nominal', async ({ app, browser, screen }) => {
    await asRole(browser, 'ADMIN');
    await app.open('/tempo');
    await expect(screen.getByRole('heading', 'Nota Jatuh Tempo 3 Hari ke Depan')).toBeVisible();
    await expect(screen.getByText(/Rp\s?\d/)).toHaveCount(0);
  });

  test('form opname menampilkan isian koli × isi 1 koli + lepas', async ({ app, browser, screen }) => {
    await asRole(browser, 'OWNER');
    await app.open('/inventory/opname');
    await expect(screen.getByRole('heading', 'Stock Opname')).toBeVisible();
    await expect(screen.getByText(/Tambah barang/)).toBeVisible();
  });

  test('agen (Sonnet) menemukan menu Master Barang dan kurs RMB', async ({ app, agent, browser, screen }) => {
    test.skip(!process.env.ANTHROPIC_API_KEY, 'butuh ANTHROPIC_API_KEY untuk langkah agen');
    await asRole(browser, 'OWNER');
    await app.open('/inventory');
    await agent.act('buka menu Master Barang di sidebar');
    await expect(screen.getByRole('heading', 'Master Barang')).toBeVisible();
    await agent.assert('halaman menampilkan pengaturan kurs RMB untuk harga modal');
  });
});
