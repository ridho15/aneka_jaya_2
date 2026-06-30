import http from "http";
import https from "https";
import crypto from "crypto";
import { URL } from "url";
import { verifyPassword } from "./auth-password.mjs";

const COOKIE_NAME = "aj_gateway_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

function requiredEnv(name, env = process.env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} wajib diisi untuk menjalankan auth gateway.`);
  return value;
}

function parseUsers(env = process.env) {
  const raw = env.AUTH_GATEWAY_USERS?.trim();
  if (!raw) throw new Error("AUTH_GATEWAY_USERS wajib diisi berisi JSON array user gateway.");
  const users = JSON.parse(raw);
  if (!Array.isArray(users) || users.length === 0) throw new Error("AUTH_GATEWAY_USERS harus berupa array dan tidak boleh kosong.");
  return users.map((user) => {
    if (!user.username || !user.externalId || !user.name || !user.passwordHash) {
      throw new Error("Setiap user gateway wajib memiliki username, externalId, name, dan passwordHash.");
    }
    return {
      username: String(user.username),
      externalId: String(user.externalId),
      name: String(user.name),
      passwordHash: String(user.passwordHash)
    };
  });
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function encodeSession(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

function decodeSession(cookieValue, secret) {
  if (!cookieValue) return null;
  const [body, signature] = cookieValue.split(".");
  if (!body || !signature || sign(body, secret) !== signature) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.externalId || !payload.name) return null;
    return payload;
  } catch {
    return null;
  }
}

function readCookie(request, name) {
  const header = request.headers.cookie || "";
  return header
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 32) {
        reject(new Error("Payload login terlalu besar."));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function htmlPage(message = "") {
  const appName = escapeHtml(process.env.NEXT_PUBLIC_APP_NAME || "SLM");
  const notice = message ? `<p class="notice">${escapeHtml(message)}</p>` : "";
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${appName} Login</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#0f172a;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{width:min(92vw,420px);border:1px solid #dbe7e2;background:white;border-radius:18px;padding:28px;box-shadow:0 24px 80px rgba(15,23,42,.08)}
    h1{margin:0 0 8px;font-size:28px;line-height:1.15}
    p{margin:0 0 20px;color:#526079;line-height:1.6}
    label{display:block;margin-top:14px;font-size:13px;font-weight:700;color:#334155}
    input{box-sizing:border-box;margin-top:6px;width:100%;min-height:44px;border:1px solid #cbd5e1;border-radius:10px;padding:10px 12px;font:inherit}
    button{margin-top:20px;width:100%;min-height:46px;border:0;border-radius:10px;background:#059669;color:white;font-weight:800;font:inherit;cursor:pointer}
    .notice{border:1px solid #fbbf24;background:#fffbeb;color:#92400e;border-radius:10px;padding:10px 12px;font-size:13px}
  </style>
</head>
<body>
  <main>
    <h1>Masuk ke ${appName}</h1>
    <p>Gunakan akun yang sudah terdaftar. Role mengikuti user yang terdaftar di aplikasi.</p>
    ${notice}
    <form method="post" action="/login">
      <label>Username<input name="username" autocomplete="username" required /></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required /></label>
      <button type="submit">Masuk</button>
    </form>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function sendHtml(response, status, body, headers = {}) {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
  response.end(body);
}

function redirect(response, location, headers = {}) {
  response.writeHead(303, { location, ...headers });
  response.end();
}

async function handleLogin(request, response, users, sessionSecret) {
  if (request.method === "GET") {
    sendHtml(response, 200, htmlPage());
    return;
  }
  if (request.method !== "POST") {
    response.writeHead(405);
    response.end();
    return;
  }
  const form = new URLSearchParams(await readBody(request));
  const username = form.get("username") || "";
  const password = form.get("password") || "";
  const user = users.find((item) => item.username === username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    sendHtml(response, 401, htmlPage("Username atau password tidak valid."));
    return;
  }
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const session = encodeSession({ username: user.username, externalId: user.externalId, name: user.name, exp }, sessionSecret);
  redirect(response, "/", {
    "set-cookie": `${COOKIE_NAME}=${session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`
  });
}

function handleLogout(response) {
  redirect(response, "/login", {
    "set-cookie": `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
  });
}

function proxyRequest(request, response, targetOrigin, trustedSecret, session) {
  const target = new URL(request.url || "/", targetOrigin);
  const client = target.protocol === "https:" ? https : http;
  const headers = { ...request.headers };
  for (const key of Object.keys(headers)) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) delete headers[key];
  }
  headers.host = target.host;
  headers["x-aneka-auth-secret"] = trustedSecret;
  headers["x-aneka-user-id"] = session.externalId;
  headers["x-aneka-user-name"] = session.name;

  const proxy = client.request(target, {
    method: request.method,
    headers
  }, (upstream) => {
    const responseHeaders = { ...upstream.headers };
    for (const key of Object.keys(responseHeaders)) {
      if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) delete responseHeaders[key];
    }
    response.writeHead(upstream.statusCode || 502, responseHeaders);
    upstream.pipe(response);
  });
  proxy.on("error", () => {
    response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    response.end("Aplikasi belum tersedia di upstream gateway.");
  });
  request.pipe(proxy);
}

export function createAuthGatewayServer(env = process.env) {
  const targetOrigin = requiredEnv("AUTH_GATEWAY_APP_ORIGIN", env);
  const trustedSecret = requiredEnv("AUTH_TRUSTED_HEADER_SECRET", env);
  const sessionSecret = requiredEnv("AUTH_GATEWAY_SESSION_SECRET", env);
  const users = parseUsers(env);

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://gateway.local");
      if (url.pathname === "/login") {
        await handleLogin(request, response, users, sessionSecret);
        return;
      }
      if (url.pathname === "/logout") {
        handleLogout(response);
        return;
      }
      const session = decodeSession(readCookie(request, COOKIE_NAME), sessionSecret);
      if (!session) {
        redirect(response, "/login");
        return;
      }
      proxyRequest(request, response, targetOrigin, trustedSecret, session);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.AUTH_GATEWAY_PORT || 3001);
  const server = createAuthGatewayServer();
  server.listen(port, () => {
    console.log(`Auth gateway listening on http://127.0.0.1:${port}`);
  });
}
