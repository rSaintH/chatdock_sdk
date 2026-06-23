import { describe, expect, it, vi } from "vitest";
import { resolveRequestTools } from "./resolveTools.js";
import type { AuditEvent, ChatbotRuntimeContext, ChatbotTool } from "../types.js";

function createContext(input: Partial<ChatbotRuntimeContext> = {}): ChatbotRuntimeContext {
  return {
    request: new Request("https://example.com/api/chat"),
    user: { id: "user_1", tenantId: "tenant_1" },
    tenant: { id: "tenant_1" },
    conversationId: "conv_1",
    clientContext: { pathname: "/clients" },
    services: {},
    ...input,
  };
}

function createTool(name: string, input: Partial<ChatbotTool> = {}): ChatbotTool {
  return {
    name,
    description: `${name} tool.`,
    inputSchema: {},
    execute: async () => ({ ok: true }),
    ...input,
  };
}

describe("resolveRequestTools", () => {
  it("filters tools by authorization, detected intent, runtime config, and hook", async () => {
    const deniedTool = createTool("denied_tool", {
      authorize: async () => ({ allowed: false, reason: "Missing role." }),
    });
    const tools = [
      createTool("search_clients"),
      createTool("delete_client"),
      createTool("search_docs"),
      deniedTool,
    ];
    const auditEvents: AuditEvent[] = [];
    const resolveTools = vi.fn(async ({ tools: resolvedTools }) => ({
      tools: [resolvedTools.find((tool) => tool.name === "search_clients"), deniedTool].filter(Boolean),
      unavailableTools: [
        {
          name: "search_docs",
          available: false,
          reason: "Disabled for this tenant.",
        },
      ],
    }));

    const result = await resolveRequestTools({
      options: {
        tools,
        toolsByIntent: {
          clients: ["search_clients", "delete_client", "denied_tool"],
        },
        detectIntent: async () => ({ intent: "clients" }),
        runtimeConfigAdapter: {
          get: async () => ({
            tools: [
              { name: "search_clients", enabled: true },
              { name: "delete_client", enabled: false },
            ],
          }),
        },
        resolveTools,
      },
      context: createContext(),
      body: {},
      messages: [
        {
          id: "msg_1",
          role: "user",
          parts: [{ type: "text", text: "find a client" }],
        },
      ],
      auditAdapter: {
        record: async (event) => {
          auditEvents.push(event);
        },
      },
    });

    expect(result.route).toEqual({ intent: "clients" });
    expect(result.tools.map((tool) => tool.name)).toEqual(["search_clients"]);
    expect(resolveTools).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { id: "user_1", tenantId: "tenant_1" },
        intent: "clients",
        settings: expect.objectContaining({
          tools: expect.any(Array),
        }),
        tools: [expect.objectContaining({ name: "search_clients" })],
      }),
    );
    expect(result.unavailableTools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "search_docs",
          reason: 'Tool is not enabled for intent "clients".',
        }),
        expect.objectContaining({
          name: "delete_client",
          reason: "Tool is disabled by runtime config.",
        }),
      ]),
    );
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "permission.denied",
          toolName: "denied_tool",
          reason: "Missing role.",
        }),
      ]),
    );
  });

  it("allows a forced tool to participate in an intent route", async () => {
    const result = await resolveRequestTools({
      options: {
        tools: [createTool("normal_tool"), createTool("forced_tool")],
        toolsByIntent: {
          support: ["normal_tool"],
        },
        detectIntent: async () => ({ intent: "support", forcedTool: "forced_tool" }),
      },
      context: createContext(),
      body: {},
      messages: [
        {
          id: "msg_1",
          role: "user",
          parts: [{ type: "text", text: "use the forced tool" }],
        },
      ],
      auditAdapter: { record: async () => undefined },
    });

    expect(result.tools.map((tool) => tool.name)).toEqual(["normal_tool", "forced_tool"]);
  });
});
