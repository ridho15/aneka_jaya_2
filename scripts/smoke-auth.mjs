const REQUIRED = [
  "APP_BASE_URL",
  "AUTH_TRUSTED_HEADER_SECRET",
  "AUTH_SSO_LOGIN_URL",
  "INITIAL_OWNER_EXTERNAL_ID"
];

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

export function appUrl(path, env = process.env) {
  const baseUrl = env.APP_BASE_URL?.trim();
  if (!baseUrl) throw new Error("APP_BASE_URL wajib diisi untuk smoke auth.");
  return `${trimTrailingSlash(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`;
}

export function smokeHeaders(externalId, env = process.env, overrides = {}) {
  return {
    "x-aneka-auth-secret": env.AUTH_TRUSTED_HEADER_SECRET || "",
    "x-aneka-user-id": externalId,
    "x-aneka-user-name": externalId,
    "x-aneka-user-role": "OWNER",
    ...overrides
  };
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
  const ownerExternalId = env.INITIAL_OWNER_EXTERNAL_ID;
  const unregisteredExternalId = env.SMOKE_UNREGISTERED_EXTERNAL_ID || `smoke-unregistered-${Date.now()}`;
  const disabledExternalId = env.SMOKE_DISABLED_EXTERNAL_ID;

  const noHeader = await fetchManual("/dashboard", {}, env, fetchImpl);
  if (!isRedirectTo(noHeader, "/login", env)) throw new Error(`Tanpa trusted header harus redirect ke /login, status=${noHeader.status}`);
  result.push("no-header-redirect-login");

  const wrongSecret = await fetchManual("/dashboard", { headers: smokeHeaders(ownerExternalId, env, { "x-aneka-auth-secret": "wrong-secret" }) }, env, fetchImpl);
  if (!isRedirectTo(wrongSecret, "/login", env)) throw new Error(`Secret salah harus redirect ke /login, status=${wrongSecret.status}`);
  result.push("wrong-secret-redirect-login");

  const login = await fetchManual("/login", {}, env, fetchImpl);
  const loginHtml = await login.text();
  if (!loginHtml.includes(env.AUTH_SSO_LOGIN_URL)) throw new Error("/login tidak memuat AUTH_SSO_LOGIN_URL.");
  result.push("login-page-sso-url");

  const ownerUsers = await fetchManual("/settings/users", { headers: smokeHeaders(ownerExternalId, env, { "x-aneka-user-role": "VIEWER" }) }, env, fetchImpl);
  if (ownerUsers.status !== 200) throw new Error(`Owner seeded harus bisa membuka /settings/users walau role header palsu, status=${ownerUsers.status}`);
  result.push("owner-db-role-wins");

  const unregisteredLanding = await fetchManual("/", { headers: smokeHeaders(unregisteredExternalId, env) }, env, fetchImpl);
  if (unregisteredLanding.status !== 200) throw new Error(`User SSO belum terdaftar harus melihat auth landing di /, status=${unregisteredLanding.status}`);
  result.push("unregistered-root-auth-landing");

  const unregistered = await fetchManual("/dashboard", { headers: smokeHeaders(unregisteredExternalId, env) }, env, fetchImpl);
  if (!isRedirectTo(unregistered, "/no-access", env)) throw new Error(`User SSO belum terdaftar harus ditolak dari protected page, status=${unregistered.status}`);
  result.push("unregistered-user-no-access");

  if (disabledExternalId) {
    const disabled = await fetchManual("/dashboard", { headers: smokeHeaders(disabledExternalId, env) }, env, fetchImpl);
    if (!isRedirectTo(disabled, "/no-access", env)) throw new Error(`User nonaktif harus ditolak dari protected page, status=${disabled.status}`);
    result.push("disabled-user-no-access");
  } else {
    result.push("disabled-user-check-skipped");
  }

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
