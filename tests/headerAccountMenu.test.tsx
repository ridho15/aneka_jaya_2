import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() })
}));

import { Header } from "@/components/layout/Header";

describe("header account menu", () => {
  it("shows the synchronized profile and logout action", () => {
    const html = renderToStaticMarkup(
      <Header
        user={{ id: "anika:1", name: "Ridho Al Amzah", email: "owner@example.test", role: "OWNER" }}
        showLogout
      />
    );

    expect(html).toContain("Ridho Al Amzah");
    expect(html).toContain("owner@example.test");
    expect(html).toContain('href="/profile"');
    expect(html).toContain("Profil");
    expect(html).toContain("Logout");
    expect(html).toContain("RA");
  });
});
