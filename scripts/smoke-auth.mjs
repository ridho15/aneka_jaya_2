const REQUIRED = [
  "APP_BASE_URL",
  "SMOKE_LOGIN_IDENTIFIER",
  "SMOKE_LOGIN_PASSWORD"
];

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

export function appUrl(path, env = process.env) {
  const baseUrl = env.APP_BASE_URL?.trim();
  if (!baseUrl) throw new Error("APP_BASE_URL wajib diisi untuk smoke auth.");
  return `${trimTrailingSlash(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`;
}

function isRedirectTo(response, targetPath, env) {
  if (![301, 302, 303, 307, 308].includes(response.status)) return false;
  const location = response.headers.get("location") || "";
  return location === appUrl(targetPath, env) || location === targetPath || location.endsWith(targetPath);
}

async function fetchManual(path, options, env, fetchImpl) {
  return fetchImpl(appUrl(path, env), { redirect: "manual", ...options });
}

function assertRequiredEnv(env) {
  const missing = REQUIRED.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`Smoke auth env belum lengkap: ${missing.join(", ")}`);
}

export async function runAuthSmoke(env = process.env, fetchImpl = fetch) {
  assertRequiredEnv(env);
  const result = [];

  const noSession = await fetchManual("/dashboard", {}, env, fetchImpl);
  if (!isRedirectTo(noSession, "/login", env)) throw new Error(`Tanpa session harus redirect ke /login, status=${noSession.status}`);
  result.push("no-session-redirect-login");

  const login = await fetchManual("/login", {}, env, fetchImpl);
  const loginHtml = await login.text();
  if (!loginHtml.includes("Email") || !loginHtml.includes("Password")) throw new Error("/login tidak memuat form login internal.");
  result.push("login-page-internal-form");

  const authResponse = await fetchManual("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: env.SMOKE_LOGIN_IDENTIFIER, password: env.SMOKE_LOGIN_PASSWORD })
  }, env, fetchImpl);
  if (authResponse.status !== 200) throw new Error(`Login smoke gagal, status=${authResponse.status}`);
  let rawCookie = authResponse.headers.get("set-cookie")
    || authResponse.headers.get("Set-Cookie")
    || authResponse.headers.getSetCookie?.()[0];
  if (!rawCookie) {
    const body = await authResponse.clone().json().catch(() => null);
    rawCookie = body?.sessionCookie;
  }
  const cookie = rawCookie?.split(";")[0];
  if (!cookie) throw new Error("Login smoke tidak menerima session cookie.");
  result.push("login-success-session-cookie");

  const ownerUsers = await fetchManual("/settings/users", { headers: { cookie } }, env, fetchImpl);
  if (ownerUsers.status !== 200) throw new Error(`User login harus bisa membuka /settings/users sesuai role database, status=${ownerUsers.status}`);
  result.push("owner-db-role-wins");

  return { ok: true, checks: result };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAuthSmoke()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
