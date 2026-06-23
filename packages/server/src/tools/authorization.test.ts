import { describe, expect, it } from "vitest";
import {
  allowRoles,
  allowTenant,
  allOfToolAuthorizers,
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
});
