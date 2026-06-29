import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));

import { getUserProfile } from "@/lib/users/profile";

describe("current user profile", () => {
  it("adds synchronized email and last-login data", async () => {
    const lastLoginAt = new Date("2026-06-29T10:00:00Z");
    mocks.findUnique.mockResolvedValue({ email: "owner@example.test", lastLoginAt });

    await expect(getUserProfile({ id: "anika:1", name: "ERP Owner", role: "OWNER" })).resolves.toEqual({
      id: "anika:1",
      name: "ERP Owner",
      role: "OWNER",
      email: "owner@example.test",
      lastLoginAt
    });
  });
});
