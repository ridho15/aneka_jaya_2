const REQUIRED = [
  "NEXT_PUBLIC_APP_MODE",
  "AUTH_PROVIDER",
  "AUTH_SESSION_SECRET",
  "DATABASE_URL",
  "CRON_SECRET",
  "ANIKA_ERP_API_BASE_URL"
];

const SECRET_NAME_PATTERN = /(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)/i;

export function validateProductionEnv(env = process.env) {
  const errors = [];
  for (const key of REQUIRED) {
    if (!env[key]?.trim()) errors.push(`${key} wajib diisi.`);
  }
  if (env.AUTH_PROVIDER !== "anika_erp") {
    if (!env.INITIAL_OWNER_EXTERNAL_ID?.trim()) errors.push("INITIAL_OWNER_EXTERNAL_ID wajib diisi.");
    if (!env.ANIKA_ERP_API_TOKEN?.trim()) errors.push("ANIKA_ERP_API_TOKEN wajib diisi.");
  }
  if (env.NEXT_PUBLIC_APP_MODE && env.NEXT_PUBLIC_APP_MODE !== "production") {
    errors.push("NEXT_PUBLIC_APP_MODE harus bernilai production.");
  }
  if (env.AUTH_PROVIDER && !["local_credentials", "anika_erp"].includes(env.AUTH_PROVIDER)) {
    errors.push("AUTH_PROVIDER harus bernilai local_credentials atau anika_erp untuk production.");
  }
  if (env.AUTH_ALLOW_DEMO_IN_PRODUCTION === "true") {
    errors.push("AUTH_ALLOW_DEMO_IN_PRODUCTION tidak boleh true di production.");
  }
  if (env.AUTH_ENABLE_DEMO_ROLE_SELECTOR === "true") {
    errors.push("AUTH_ENABLE_DEMO_ROLE_SELECTOR tidak boleh true di production.");
  }
  if (env.AUTH_TRUSTED_HEADER_ALLOW_ROLE_HEADER === "true") {
    errors.push("AUTH_TRUSTED_HEADER_ALLOW_ROLE_HEADER tidak boleh true di production.");
  }
  if (env.CRON_SECRET === "change-me") {
    errors.push("CRON_SECRET wajib diganti dari placeholder change-me.");
  }
  const openCloudKeys = ["OPENCLOUD_API_BASE_URL", "OPENCLOUD_PROJECT_ID", "OPENCLOUD_API_KEY", "OPENCLOUD_STORAGE_BUCKET"];
  if (openCloudKeys.some((key) => env[key]?.trim())) {
    for (const key of openCloudKeys) {
      if (!env[key]?.trim()) errors.push(`${key} wajib diisi ketika integrasi OpenCloud diaktifkan.`);
    }
  }
  if (env.WHATSAPP_PROVIDER && !["meta_cloud_api", "third_party"].includes(env.WHATSAPP_PROVIDER)) {
    errors.push("WHATSAPP_PROVIDER harus bernilai meta_cloud_api atau third_party.");
  }
  if (env.WHATSAPP_PROVIDER === "meta_cloud_api") {
    if (!env.WHATSAPP_CLOUD_API_TOKEN?.trim()) errors.push("WHATSAPP_CLOUD_API_TOKEN wajib diisi untuk provider meta_cloud_api.");
    if (!env.WHATSAPP_PHONE_NUMBER_ID?.trim()) errors.push("WHATSAPP_PHONE_NUMBER_ID wajib diisi untuk provider meta_cloud_api.");
  }
  if (env.WHATSAPP_PROVIDER === "third_party") {
    if (!env.WHATSAPP_THIRD_PARTY_ENDPOINT?.trim()) errors.push("WHATSAPP_THIRD_PARTY_ENDPOINT wajib diisi untuk provider third_party.");
    if (!env.WHATSAPP_THIRD_PARTY_TOKEN?.trim()) errors.push("WHATSAPP_THIRD_PARTY_TOKEN wajib diisi untuk provider third_party.");
  }
  for (const key of Object.keys(env)) {
    if (key.startsWith("NEXT_PUBLIC_") && SECRET_NAME_PATTERN.test(key)) {
      errors.push(`${key} tidak boleh memakai prefix NEXT_PUBLIC_ karena terlihat seperti secret.`);
    }
  }
  return errors;
}

export function assertProductionEnv(env = process.env) {
  const errors = validateProductionEnv(env);
  if (errors.length > 0) {
    const message = ["Production env belum siap:", ...errors.map((error) => `- ${error}`)].join("\n");
    throw new Error(message);
  }
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    assertProductionEnv();
    console.log(JSON.stringify({ ok: true, checked: REQUIRED }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
