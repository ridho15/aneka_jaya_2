import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, can, roleLabel } from "@/lib/auth/roles";

describe("Super Admin permission contract", () => {
  it("maps OWNER to the Super Admin UI label", () => {
    expect(roleLabel("OWNER")).toBe("Super Admin");
  });

  it("grants OWNER every declared permission", () => {
    expect(new Set(ROLE_PERMISSIONS.OWNER)).toEqual(new Set(ALL_PERMISSIONS));
    for (const permission of ALL_PERMISSIONS) expect(can("OWNER", permission)).toBe(true);
  });

  it("allows Admin to manage sales while keeping expense and stock management Super Admin only", () => {
    expect(can("OWNER", "penjualan.manage")).toBe(true);
    expect(can("ADMIN", "penjualan.manage")).toBe(true);
    for (const permission of ["pengeluaran.manage", "stock.manage", "stock.adjust"] as const) {
      expect(can("OWNER", permission)).toBe(true);
      expect(can("ADMIN", permission)).toBe(false);
      expect(can("FINANCE", permission)).toBe(false);
      expect(can("MANAGER", permission)).toBe(false);
      expect(can("VIEWER", permission)).toBe(false);
    }
  });

  it("keeps Admin focused on sales creation and management while preserving other operational roles", () => {
    expect(ROLE_PERMISSIONS.ADMIN).toEqual(["penjualan.create", "penjualan.manage", "do.view", "do.process", "do.assign"]);
    for (const permission of ["pengeluaran.view", "pengeluaran.create", "stock.view", "stock.create", "master_data.view", "guide.view"] as const) {
      expect(can("ADMIN", permission)).toBe(false);
    }
    for (const role of ["FINANCE", "MANAGER"] as const) {
      expect(can(role, "pengeluaran.view")).toBe(true);
      expect(can(role, "master_data.view")).toBe(true);
    }
    expect(can("DELIVERY_DRIVER", "do.view")).toBe(true);
    expect(can("DELIVERY_DRIVER", "do.process")).toBe(true);
    expect(can("DELIVERY_DRIVER", "do.assign")).toBe(false);
    expect(can("DELIVERY_DRIVER", "penjualan.create")).toBe(false);
    expect(can("VIEWER", "pengeluaran.view")).toBe(false);
    expect(can("VIEWER", "master_data.view")).toBe(false);
  });

  it("keeps expense creation limited to owner and finance roles", () => {
    expect(can("ADMIN", "pengeluaran.create")).toBe(false);
    expect(can("FINANCE", "pengeluaran.create")).toBe(true);
    expect(can("MANAGER", "pengeluaran.create")).toBe(false);
    expect(can("VIEWER", "pengeluaran.create")).toBe(false);
  });

  it("keeps Profit Operasional settings and dashboard visibility Super Admin only", () => {
    expect(can("OWNER", "settings.profit.manage")).toBe(true);
    expect(can("ADMIN", "settings.profit.manage")).toBe(false);
    expect(can("FINANCE", "settings.profit.manage")).toBe(false);
    expect(can("MANAGER", "settings.profit.manage")).toBe(false);
    expect(can("VIEWER", "settings.profit.manage")).toBe(false);
  });

  it("keeps ERP Sync settings Super Admin only", () => {
    expect(can("OWNER", "settings.erp_sync.manage")).toBe(true);
    expect(can("ADMIN", "settings.erp_sync.manage")).toBe(false);
    expect(can("FINANCE", "settings.erp_sync.manage")).toBe(false);
    expect(can("MANAGER", "settings.erp_sync.manage")).toBe(false);
    expect(can("VIEWER", "settings.erp_sync.manage")).toBe(false);
  });
});
