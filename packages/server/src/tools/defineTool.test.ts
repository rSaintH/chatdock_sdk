import { describe, expect, it } from "vitest";
import { defineTool } from "./defineTool.js";
import type { ChatbotRuntimeContext } from "../types.js";

describe("defineTool", () => {
  it("returns the tool definition", () => {
    const tool = defineTool({
      name: "buscar_clientes",
      description: "Busca clientes.",
      inputSchema: {},
      execute: async () => ({ data: { ok: true } }),
    });

    expect(tool.name).toBe("buscar_clientes");
  });

  it("rejects blank descriptions", () => {
    expect(() =>
      defineTool({
        name: "buscar_clientes",
        description: "   ",
        inputSchema: {},
        execute: async () => ({ data: { ok: true } }),
      }),
    ).toThrow(/must include a description/);
  });

  it("accepts input as an alias for inputSchema", () => {
    const tool = defineTool({
      name: "buscar_clientes",
      description: "Busca clientes.",
      input: { type: "object" },
      execute: async () => ({ data: { ok: true } }),
    });

    expect(tool.inputSchema).toEqual({ type: "object" });
  });

  it("maps dangerous to destructive for compatibility", () => {
    const tool = defineTool({
      name: "apagar_cliente",
      description: "Apaga cliente.",
      inputSchema: {},
      dangerous: true,
      requiresConfirmation: true,
      execute: async () => ({ data: { ok: true } }),
    });

    expect(tool.destructive).toBe(true);
    expect(tool.dangerous).toBe(true);
    expect(tool.requiresConfirmation).toBe(true);
  });

  it("turns declarative permissions into an authorizer", async () => {
    const tool = defineTool({
      name: "buscar_clientes",
      description: "Busca clientes.",
      inputSchema: {},
      permissions: [
        { type: "role", anyOf: ["admin"] },
        { type: "scope", allOf: ["clients:read"] },
        { type: "tenant", required: true },
      ],
      execute: async () => ({ data: { ok: true } }),
    });
    const context = {
      request: new Request("https://example.com"),
      user: {
        id: "user_1",
        roles: ["admin"],
        scopes: ["clients:read"],
        tenantId: "tenant_1",
      },
      conversationId: "conv_1",
      clientContext: {},
      services: {},
    } satisfies ChatbotRuntimeContext;

    await expect(tool.authorize?.({ tool, context })).resolves.toBe(true);
    await expect(
      tool.authorize?.({
        tool,
        context: {
          ...context,
          user: { id: "user_2", roles: ["support"], scopes: ["clients:read"], tenantId: "tenant_1" },
        },
      }),
    ).resolves.toEqual({ allowed: false, reason: expect.any(String) });
  });

  it("turns a declarative policy matrix into an authorizer", async () => {
    const tool = defineTool({
      name: "buscar_relatorio",
      description: "Busca relatorio.",
      inputSchema: {},
      policy: {
        roles: { anyOf: ["admin"] },
        featureFlags: ["reports"],
        predicates: [
          {
            name: "allowed report",
            code: "report_denied",
            reason: "Report unavailable.",
            when: ({ input }) => (input as { id: string }).id !== "blocked",
          },
        ],
      },
      execute: async () => ({ data: { ok: true } }),
    });
    const context = {
      request: new Request("https://example.com"),
      user: { id: "user_1", roles: ["admin"] },
      conversationId: "conv_1",
      clientContext: {},
      runtimeConfig: { featureFlags: { reports: true } },
      services: {},
    } satisfies ChatbotRuntimeContext;

    await expect(tool.authorize?.({ tool, context, phase: "filter" })).resolves.toBe(true);
    await expect(tool.authorize?.({ tool, context, input: { id: "open" }, phase: "execute" })).resolves.toBe(true);
    await expect(tool.authorize?.({ tool, context, input: { id: "blocked" }, phase: "execute" })).resolves.toEqual({
      allowed: false,
      reason: "Report unavailable.",
      code: "report_denied",
    });
  });
});
