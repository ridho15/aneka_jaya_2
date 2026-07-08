import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("@/components/layout/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/settings/RoleSelector", () => ({ RoleSelector: () => null }));

const mocks = vi.hoisted(() => ({
  getCurrentRole: vi.fn(),
  getWhatsappProviderStatus: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentRole: mocks.getCurrentRole }));
vi.mock("@/lib/auth/demoUi", () => ({ isDemoRoleSelectorEnabled: () => false }));
vi.mock("@/lib/whatsapp/whatsappClient", () => ({ getWhatsappProviderStatus: mocks.getWhatsappProviderStatus }));

const { default: SettingsPage } = await import("@/app/settings/page");

describe("SettingsPage", () => {
  beforeEach(() => {
    mocks.getCurrentRole.mockResolvedValue("OWNER");
    mocks.getWhatsappProviderStatus.mockReturnValue({ provider: null, ready: false, message: "WhatsApp belum dikonfigurasi." });
  });

  it("shows the Profit SLM settings card for authorized users", async () => {
    const html = renderToStaticMarkup(await SettingsPage());

    expect(html).toContain("Profit SLM");
    expect(html).toContain("/settings/profit-slm");
  });
});
