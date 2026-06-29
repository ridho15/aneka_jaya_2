import "server-only";

export function isOpenCloudConfigured() {
  return Boolean(process.env.OPENCLOUD_API_BASE_URL && process.env.OPENCLOUD_PROJECT_ID && process.env.OPENCLOUD_API_KEY && process.env.OPENCLOUD_STORAGE_BUCKET);
}

export function getOpenCloudStatus() {
  return { configured: isOpenCloudConfigured(), message: isOpenCloudConfigured() ? "OpenCloud siap digunakan" : "OpenCloud belum dikonfigurasi" };
}
