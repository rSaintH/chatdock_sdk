import { describe, expect, it } from "vitest";
import {
  allowFeatureFlag,
  allowRoles,
  allowTenant,
  allOfToolAuthorizers,
  createToolPolicyAuthorizer,
  denyDestructiveInDemo,
  requireHumanApproval,
} from "./authorization.js";
import type { ChatbotRuntimeContext, ChatbotTool } from "../types.js";

function createContext(input: Partial<ChatbotRuntimeContext> = {}): ChatbotRuntimeContext {
  return {
    request: new Request("https://example.com"),
    user: { id: "user_1", roles: ["admin"], tenantId: "tenant_1" },
    conversationId: "conversation_1",
    clientContext: {},
    services: {},
    ...input,
  };
}

const tool: ChatbotTool = {
  name: "sync_data",
  description: "Sync data",
  inputSchema: {},
  execute: async () => ({}),
};

describe("authorization helpers", () => {
  it("allows users with the required role", async () => {
    const authorize = allowRoles(["admin"]);

    expect(await authorize({ tool, context: createContext() })).toBe(true);
    expect(await authorize({ tool, context: createContext({ user: { id: "user_2", roles: ["support"] } }) })).toEqual({
      allowed: false,
      reason: expect.any(String),
    });
  });

  it("allows only matching tenants", async () => {
    const authorize = allowTenant("tenant_1");

    expect(await authorize({ tool, context: createContext() })).toBe(true);
    expect(await authorize({ tool, context: createContext({ user: { id: "user_2", tenantId: "tenant_2" } }) })).toEqual({
      allowed: false,
      reason: expect.any(String),
    });
  });

  it("allows enabled feature flags from runtime config or client context", async () => {
    const authorize = allowFeatureFlag("gi_admin_tools");

    expect(
      await authorize({
        tool,
        context: createContext({ runtimeConfig: { featureFlags: { gi_admin_tools: true } } }),
      }),
    ).toBe(true);
    expect(
      await authorize({
        tool,
        context: createContext({ clientContext: { featureFlags: { gi_admin_tools: true } } }),
      }),
    ).toBe(true);
    expect(await authorize({ tool, context: createContext() })).toEqual({
      allowed: false,
      reason: 'Feature flag "gi_admin_tools" is not enabled.',
    });
  });

  it("requires human approval from client context", async () => {
    const authorize = requireHumanApproval();

    expect(await authorize({ tool, context: createContext() })).toEqual({
      allowed: false,
      reason: expect.any(String),
    });
    expect(await authorize({ tool, context: createContext({ clientContext: { approvedToolNames: ["sync_data"] } }) })).toBe(
      true,
    );
  });

  it("denies destructive tools in demo mode", async () => {
    const authorize = denyDestructiveInDemo();
    const destructiveTool = { ...tool, destructive: true };

    await expect(
      authorize({ tool: destructiveTool, context: createContext({ clientContext: { demoMode: true } }) }),
    ).resolves.toEqual({ allowed: false, reason: expect.any(String) });
  });

  it("composes required authorizers", async () => {
    const authorize = allOfToolAuthorizers(allowRoles(["admin"]), allowTenant("tenant_1"));

    await expect(authorize({ tool, context: createContext() })).resolves.toBe(true);
  });

  it("supports a declarative policy matrix with execute-time predicates", async () => {
    const authorize = createToolPolicyAuthorizer<{ tenantId: string }>({
      roles: { anyOf: ["admin"] },
      scopes: { allOf: ["reports:read"] },
      tenants: { required: true },
      featureFlags: ["reports_tool"],
      predicates: [
        {
          name: "same tenant",
          code: "tenant_mismatch",
          reason: "Cannot access another tenant.",
          when: ({ context, input }) => context.user?.tenantId === input.tenantId,
        },
      ],
    });
    const context = createContext({
      user: {
        id: "user_1",
        roles: ["admin"],
        scopes: ["reports:read"],
        tenantId: "tenant_1",
      },
      runtimeConfig: { featureFlags: { reports_tool: true } },
    });

    await expect(authorize({ tool, context, phase: "filter" })).resolves.toBe(true);
    await expect(authorize({ tool, context, input: { tenantId: "tenant_1" }, phase: "execute" })).resolves.toBe(true);
    await expect(authorize({ tool, context, input: { tenantId: "tenant_2" }, phase: "execute" })).resolves.toEqual({
      allowed: false,
      reason: "Cannot access another tenant.",
      code: "tenant_mismatch",
    });
  });
});
