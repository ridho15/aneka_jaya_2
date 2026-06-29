import { describe, expect, it } from "vitest";
import { validateProductionEnv } from "@/scripts/check-production-env.mjs";

const validEnv = {
  NEXT_PUBLIC_APP_MODE: "production",
  AUTH_PROVIDER: "local_credentials",
  AUTH_SESSION_SECRET: "super-secret",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/aneka_jaya",
  INITIAL_OWNER_EXTERNAL_ID: "owner",
  CRON_SECRET: "cron-secret",
  ANIKA_ERP_API_BASE_URL: "https://erp.example.test",
  ANIKA_ERP_API_TOKEN: "erp-secret"
};

describe("production env validation", () => {
  it("accepts a complete production-like env", () => {
    expect(validateProductionEnv(validEnv)).toEqual([]);
  });

  it("rejects missing required env and unsafe defaults", () => {
    expect(validateProductionEnv({ NEXT_PUBLIC_APP_MODE: "mock", AUTH_PROVIDER: "demo", CRON_SECRET: "change-me" })).toEqual(expect.arrayContaining([
      "AUTH_SESSION_SECRET wajib diisi.",
      "DATABASE_URL wajib diisi.",
      "INITIAL_OWNER_EXTERNAL_ID wajib diisi.",
      "NEXT_PUBLIC_APP_MODE harus bernilai production.",
      "AUTH_PROVIDER harus bernilai local_credentials atau anika_erp untuk production.",
      "CRON_SECRET wajib diganti dari placeholder change-me."
    ]));
  });

  it("accepts ERP login auth without a static ERP token or seeded owner", () => {
    expect(validateProductionEnv({
      ...validEnv,
      AUTH_PROVIDER: "anika_erp",
      INITIAL_OWNER_EXTERNAL_ID: "",
      ANIKA_ERP_API_TOKEN: ""
    })).toEqual([]);
  });

  it("rejects the demo role selector flag in production", () => {
    expect(validateProductionEnv({ ...validEnv, AUTH_ENABLE_DEMO_ROLE_SELECTOR: "true" })).toContain(
      "AUTH_ENABLE_DEMO_ROLE_SELECTOR tidak boleh true di production."
    );
  });

  it("rejects the trusted role header development override in production", () => {
    expect(validateProductionEnv({ ...validEnv, AUTH_TRUSTED_HEADER_ALLOW_ROLE_HEADER: "true" })).toContain(
      "AUTH_TRUSTED_HEADER_ALLOW_ROLE_HEADER tidak boleh true di production."
    );
  });

  it("rejects secrets exposed through NEXT_PUBLIC env names", () => {
    expect(validateProductionEnv({ ...validEnv, NEXT_PUBLIC_API_TOKEN: "leaked" })).toContain("NEXT_PUBLIC_API_TOKEN tidak boleh memakai prefix NEXT_PUBLIC_ karena terlihat seperti secret.");
  });

  it("validates enabled integration credentials", () => {
    expect(validateProductionEnv({ ...validEnv, WHATSAPP_PROVIDER: "mock" })).toContain(
      "WHATSAPP_PROVIDER harus bernilai meta_cloud_api atau third_party."
    );
    expect(validateProductionEnv({ ...validEnv, WHATSAPP_PROVIDER: "meta_cloud_api" })).toEqual(expect.arrayContaining([
      "WHATSAPP_CLOUD_API_TOKEN wajib diisi untuk provider meta_cloud_api.",
      "WHATSAPP_PHONE_NUMBER_ID wajib diisi untuk provider meta_cloud_api."
    ]));
    expect(validateProductionEnv({ ...validEnv, OPENCLOUD_API_BASE_URL: "https://cloud.example.test" })).toContain(
      "OPENCLOUD_PROJECT_ID wajib diisi ketika integrasi OpenCloud diaktifkan."
    );
  });
});
