import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginPageShell } from "@/components/auth/LoginPageShell";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe("login page shell", () => {
  it("renders a focused operational login page without auth diagnostics", () => {
    const html = renderToStaticMarkup(<LoginPageShell />);

    expect(html).toContain("SLM");
    expect(html).toContain("SLM Internal App");
    expect(html).toContain("Masuk ke sistem");
    expect(html).toContain("Email atau username");
    expect(html).toContain("Password");
    expect(html).toContain("Hubungi Super Admin jika tidak bisa masuk.");
    expect(html).not.toContain("Internal Operations");
    expect(html).not.toContain("Role-based Access");
    expect(html).not.toContain("ERP-ready");
    expect(html).not.toContain("Login internal aktif");
    expect(html).not.toContain("Mode aplikasi");
    expect(html).not.toContain("SSO");
    expect(html).not.toContain("Pilih role demo");
  });
});
