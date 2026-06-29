import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  class UserForbiddenError extends Error {
    constructor(message = "Tidak punya akses kelola user.") {
      super(message);
      this.name = "UserForbiddenError";
    }
  }
  return {
    role: "OWNER",
    UserForbiddenError,
    listUsers: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn()
  };
});

vi.mock("@/lib/auth/session", () => ({
  getCurrentRole: vi.fn(async () => mocks.role)
}));

vi.mock("@/lib/users/store", () => ({
  UserForbiddenError: mocks.UserForbiddenError,
  listUsers: mocks.listUsers,
  createUser: mocks.createUser,
  updateUser: mocks.updateUser
}));

import { GET, POST } from "@/app/api/users/route";
import { PUT } from "@/app/api/users/[id]/route";

describe("users api routes", () => {
  beforeEach(() => {
    mocks.role = "OWNER";
    mocks.listUsers.mockReset();
    mocks.createUser.mockReset();
    mocks.updateUser.mockReset();
  });

  it("returns 403 before store access when role lacks users.manage", async () => {
    mocks.role = "ADMIN";

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.listUsers).not.toHaveBeenCalled();
  });

  it("returns 403 when list users is forbidden", async () => {
    mocks.listUsers.mockRejectedValue(new mocks.UserForbiddenError());

    const response = await GET();

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false });
  });

  it("creates users through the store", async () => {
    mocks.createUser.mockResolvedValue({ id: "u-1", externalId: "sso-1", name: "User", role: "VIEWER", isActive: true });

    const response = await POST(new Request("http://local/api/users", { method: "POST", body: JSON.stringify({ externalId: "sso-1", name: "User", role: "VIEWER" }) }));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, data: { externalId: "sso-1" } });
  });

  it("updates users through the store", async () => {
    mocks.updateUser.mockResolvedValue({ id: "u-1", externalId: "sso-1", name: "User", role: "ADMIN", isActive: true });

    const response = await PUT(
      new Request("http://local/api/users/u-1", { method: "PUT", body: JSON.stringify({ name: "User", role: "ADMIN" }) }),
      { params: Promise.resolve({ id: "u-1" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.updateUser).toHaveBeenCalledWith("u-1", expect.objectContaining({ role: "ADMIN" }));
  });
});
