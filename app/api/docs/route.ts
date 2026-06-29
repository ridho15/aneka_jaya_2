import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/auth/session";

export async function GET() {
  if ((await getCurrentRole()) !== "OWNER") {
    return NextResponse.json({ success: false, message: "Tidak punya akses dokumentasi API." }, { status: 403 });
  }

  const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Aneka Jaya API Docs</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
    main { max-width: 1120px; margin: 0 auto; padding: 32px 20px 56px; }
    h1 { margin: 0 0 6px; font-size: 28px; }
    p { color: #475569; }
    a { color: #2563eb; font-weight: 700; }
    section { margin-top: 20px; border: 1px solid #e2e8f0; background: #fff; border-radius: 8px; overflow: hidden; }
    h2 { margin: 0; padding: 14px 16px; border-bottom: 1px solid #e2e8f0; font-size: 16px; background: #f1f5f9; }
    pre { margin: 0; padding: 16px; overflow: auto; font-size: 12px; line-height: 1.55; }
    .path { padding: 12px 16px; border-top: 1px solid #e2e8f0; }
    .method { display: inline-block; min-width: 54px; margin-right: 8px; font-weight: 800; color: #166534; }
  </style>
</head>
<body>
  <main>
    <h1>Aneka Jaya Internal API</h1>
    <p>Dokumentasi ringkas dari <a href="/api/docs/openapi.json">OpenAPI JSON</a>. Akses dibatasi untuk Super Admin.</p>
    <section>
      <h2>Endpoint</h2>
      <div id="paths"><pre>Memuat dokumentasi...</pre></div>
    </section>
    <section>
      <h2>Raw OpenAPI</h2>
      <pre id="raw"></pre>
    </section>
  </main>
  <script>
    fetch('/api/docs/openapi.json').then(r => r.json()).then(spec => {
      document.getElementById('raw').textContent = JSON.stringify(spec, null, 2);
      document.getElementById('paths').innerHTML = Object.entries(spec.paths || {}).map(([path, methods]) =>
        Object.entries(methods).map(([method, op]) =>
          '<div class="path"><span class="method">' + method.toUpperCase() + '</span><b>' + path + '</b><p>' + (op.summary || '') + '</p></div>'
        ).join('')
      ).join('');
    }).catch(error => {
      document.getElementById('paths').innerHTML = '<pre>Gagal memuat OpenAPI: ' + error.message + '</pre>';
    });
  </script>
</body>
</html>`;

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
