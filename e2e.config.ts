import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { anthropic } from '@ai-sdk/anthropic';

/**
 * End-to-end test SLM (framework `e2e`, https://e2e.tester.army).
 *
 * - Model agen: Claude Sonnet lewat @ai-sdk/anthropic. Butuh env ANTHROPIC_API_KEY.
 *   Test tanpa langkah `agent.*` jalan tanpa model.
 * - App: APP_URL (default http://localhost:3000). Jalankan app dalam mode demo,
 *   mis. `NEXT_PUBLIC_APP_MODE=mock AUTH_PROVIDER=demo INVENTORY_SOURCE=local npm run dev`,
 *   karena test memilih role lewat cookie demo `aneka_jaya_role`.
 * - E2E_CDP_ENDPOINT (opsional): sambung ke Chromium yang sudah berjalan
 *   (mis. `chrome --headless --remote-debugging-port=9222`) alih-alih meluncurkan browser sendiri.
 */
const cdp = process.env.E2E_CDP_ENDPOINT;

export default {
  targets: [{
    engine: web(cdp ? { connect: { cdpEndpoint: () => cdp } } : {}),
    app: {
      url: process.env.APP_URL ?? 'http://localhost:3000',
    },
  }],
  agents: {
    default: {
      model: anthropic(process.env.E2E_MODEL ?? 'claude-sonnet-5-5'),
      system: 'Kamu QA tester untuk aplikasi internal SLM (bahasa Indonesia). Periksa setiap hasil di layar dengan teliti.',
      context: 'Istilah: "koli" = karton; stok disimpan per satuan (Lusin/Pack/Box). "Toko" dan "Gudang" adalah lokasi stok. Menu ada di sidebar kiri.',
    },
  },
} satisfies E2EConfig;
