import { describe, expect, it } from "vitest";
import { assertSameTenant, getTenantId, requireTenant } from "./tenant.js";

describe("tenant helpers", () => {
  it("reads tenant id from the user", () => {
    expect(getTenantId({ id: "user_1", tenantId: "tenant_1" })).toBe("tenant_1");
  });

  it("requires a tenant when requested", () => {
    expect(() => requireTenant({ id: "user_1" })).toThrow("Tenant is required.");
    expect(requireTenant({ id: "user_1", tenantId: "tenant_1" })).toEqual({ id: "tenant_1" });
  });

  it("asserts tenant equality", () => {
    expect(() => assertSameTenant("tenant_1", "tenant_2")).toThrow("Tenant mismatch.");
    expect(() => assertSameTenant("tenant_1", "tenant_1")).not.toThrow();
  });
});
