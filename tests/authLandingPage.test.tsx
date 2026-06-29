import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthLandingPage } from "@/components/auth/AuthLandingPage";

describe("auth landing page CTA", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows an active SSO login CTA when the login URL is configured", () => {
    vi.stubEnv("AUTH_PROVIDER", "trusted_header");
    vi.stubEnv("AUTH_SSO_LOGIN_URL", "https://sso.example.test/login");
    vi.stubEnv("AUTH_ENABLE_DEMO_ROLE_SELECTOR", "false");

    const html = renderToStaticMarkup(<AuthLandingPage currentRole="VIEWER" />);

    expect(html).toContain("Masuk ke Sistem");
    expect(html).toContain("https://sso.example.test/login");
    expect(html).toContain("Login SSO siap digunakan.");
    expect(html).not.toContain("Masuk ke Sistem belum tersedia");
  });

  it("shows a disabled login CTA when SSO is not configured", () => {
    vi.stubEnv("AUTH_PROVIDER", "trusted_header");
    vi.stubEnv("AUTH_SSO_LOGIN_URL", "");
    vi.stubEnv("AUTH_ENABLE_DEMO_ROLE_SELECTOR", "false");

    const html = renderToStaticMarkup(<AuthLandingPage currentRole="VIEWER" />);

    expect(html).toContain("Masuk ke Sistem belum tersedia");
    expect(html).toContain("Login belum tersedia");
    expect(html).toContain("SSO perusahaan belum dikonfigurasi. Hubungi operator sistem.");
    expect(html).toContain("Lihat status akses");
  });
});
