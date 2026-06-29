import { describe, expect, it } from "vitest";
import { isApprovalAction, validateApprovalTransition } from "@/lib/approval/validation";

describe("approval validation", () => {
  it("only accepts approve and reject actions", () => {
    expect(isApprovalAction("approve")).toBe(true);
    expect(isApprovalAction("reject")).toBe(true);
    expect(isApprovalAction("cancel")).toBe(false);
    expect(isApprovalAction(undefined)).toBe(false);
  });

  it("allows approve for pending approval records", () => {
    expect(validateApprovalTransition("pending_approval", "approve")).toBeNull();
  });

  it("rejects non-pending approval records", () => {
    expect(validateApprovalTransition("approved", "approve")).toBe("Approval hanya dapat diproses saat status pending.");
    expect(validateApprovalTransition("rejected", "reject", "Duplikat")).toBe("Approval hanya dapat diproses saat status pending.");
  });

  it("requires a reason for reject", () => {
    expect(validateApprovalTransition("pending_approval", "reject")).toBe("Alasan reject wajib diisi.");
    expect(validateApprovalTransition("pending_approval", "reject", "   ")).toBe("Alasan reject wajib diisi.");
    expect(validateApprovalTransition("pending_approval", "reject", "Data tidak sesuai")).toBeNull();
  });
});
