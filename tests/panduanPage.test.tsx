import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("@/components/layout/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

const mocks = vi.hoisted(() => ({
  role: "OWNER",
  getCurrentRole: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentRole: mocks.getCurrentRole }));

const { default: PanduanPage } = await import("@/app/panduan/page");

describe("PanduanPage", () => {
  beforeEach(() => {
    mocks.role = "OWNER";
    mocks.getCurrentRole.mockResolvedValue(mocks.role);
  });

  it("shows role-aware guide content for owner", async () => {
    const html = renderToStaticMarkup(await PanduanPage());

    expect(html).toContain("Panduan Penggunaan SLM");
    expect(html).toContain("/guide/screenshots/dashboard.png");
    expect(html).toContain("ERP Sync");
    expect(html).toContain("/settings/erp-sync");
  });

  it("blocks access for roles without guide permission", async () => {
    mocks.role = "VIEWER";
    mocks.getCurrentRole.mockResolvedValue(mocks.role);

    await expect(PanduanPage()).rejects.toThrow("redirect:/no-access");
  });
});
