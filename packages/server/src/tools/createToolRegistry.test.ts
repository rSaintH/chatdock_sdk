import { describe, expect, it, vi } from "vitest";
import { createToolRegistry, filterAuthorizedTools } from "./createToolRegistry.js";
import { createInMemoryToolExecutionRateLimit, estimateModelCost } from "./createToolExecutionRateLimit.js";
import type { ChatbotRuntimeContext, ChatbotTool } from "../types.js";

function createContext(input: Partial<ChatbotRuntimeContext> = {}): ChatbotRuntimeContext {
  return {
    request: new Request("https://example.com"),
    user: { id: "user_1" },
    conversationId: "conv_1",
    clientContext: {},
    services: {},
    ...input,
  };
}

describe("createToolRegistry", () => {
  it("filters unauthorized tools", async () => {
    const execute = vi.fn(async () => ({ data: "ok" }));
    const auditRecord = vi.fn();
    const tool: ChatbotTool = {
      name: "buscar_clientes",
      description: "Busca clientes",
      inputSchema: {},
      authorize: async () => ({ allowed: false, reason: "Missing role." }),
      execute,
    };

    const registry = createToolRegistry({
      tools: [tool],
      context: createContext(),
      auditAdapter: { record: auditRecord },
    });

    const registeredTool = registry["buscar_clientes"];
    expect(registeredTool).toBeDefined();
    await expect(registeredTool!.execute?.({ query: "abc" } as never, {} as never)).resolves.toEqual({
      error: "Missing role.",
      code: "tool_denied",
      retryable: false,
      metadata: { denied: true },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "permission.denied",
        conversationId: "conv_1",
        scope: "tool",
        toolName: "buscar_clientes",
        reason: "Missing role.",
      }),
    );
  });

  it("records tool.filtered when a tool is filtered before model exposure", async () => {
    const auditRecord = vi.fn();
    const tool: ChatbotTool = {
      name: "admin_report",
      description: "Admin report",
      inputSchema: {},
      authorize: async () => ({ allowed: false, reason: "Admin only." }),
      execute: async () => ({ data: "ok" }),
    };

    await expect(
      filterAuthorizedTools({
        tools: [tool],
        context: createContext(),
        auditAdapter: { record: auditRecord },
      }),
    ).resolves.toEqual([]);

    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool.filtered",
        conversationId: "conv_1",
        toolName: "admin_report",
        reason: "Admin only.",
      }),
    );
  });

  it("returns a structured denial result when execute-time authorization rejects the input", async () => {
    const execute = vi.fn(async () => ({ data: "ok" }));
    const auditRecord = vi.fn();
    const tool: ChatbotTool<{ tenantId: string }> = {
      name: "tenant_report",
      description: "Tenant report",
      inputSchema: {},
      authorize: async ({ input, phase }) => {
        if (phase === "filter") {
          return true;
        }

        return input?.tenantId === "tenant_1"
          ? true
          : {
              allowed: false,
              reason: "Tenant mismatch.",
              code: "tenant_mismatch",
              metadata: { expectedTenantId: "tenant_1" },
            };
      },
      execute,
    };

    const registry = createToolRegistry({
      tools: [tool as ChatbotTool],
      context: createContext(),
      auditAdapter: { record: auditRecord },
    });

    await expect(registry["tenant_report"]!.execute?.({ tenantId: "tenant_2" } as never, {} as never)).resolves.toEqual({
      error: "Tenant mismatch.",
      code: "tenant_mismatch",
      retryable: false,
      metadata: {
        denied: true,
        expectedTenantId: "tenant_1",
      },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool.denied",
        conversationId: "conv_1",
        toolName: "tenant_report",
        input: { tenantId: "tenant_2" },
        reason: "Tenant mismatch.",
        code: "tenant_mismatch",
      }),
    );
  });

  it("rejects duplicate tool names", () => {
    const tool: ChatbotTool = {
      name: "duplicada",
      description: "Duplicada",
      inputSchema: {},
      execute: async () => ({ data: "ok" }),
    };

    expect(() =>
      createToolRegistry({
        tools: [tool, tool],
        context: createContext(),
        auditAdapter: { record: vi.fn() },
      }),
    ).toThrow(/Duplicate tool registered/);
  });

  it("rate limits destructive tool execution per user per day", async () => {
    const execute = vi.fn(async () => ({ data: "removed" }));
    const auditRecord = vi.fn();
    const tool: ChatbotTool = {
      name: "excluir_cliente",
      description: "Exclui cliente",
      inputSchema: {},
      destructive: true,
      execute,
    };

    const registry = createToolRegistry({
      tools: [tool],
      context: createContext({ clientContext: { approvedToolNames: ["excluir_cliente"] } }),
      auditAdapter: { record: auditRecord },
      toolExecutionRateLimitAdapter: createInMemoryToolExecutionRateLimit({
        destructivePerUserPerDay: 1,
        now: () => new Date("2026-06-19T10:00:00.000Z"),
      }),
    });

    const registeredTool = registry["excluir_cliente"];
    await expect(registeredTool!.execute?.({ id: "cli_1" } as never, {} as never)).resolves.toEqual({
      data: "removed",
    });
    await expect(registeredTool!.execute?.({ id: "cli_2" } as never, {} as never)).rejects.toThrow(
      /Daily destructive tool limit exceeded/,
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "rate_limit.denied",
        conversationId: "conv_1",
        scope: "tool",
        toolName: "excluir_cliente",
        reason: "Daily destructive tool limit exceeded.",
      }),
    );
  });

  it("blocks destructive tools unless explicit approval is present", async () => {
    const execute = vi.fn(async () => ({ data: "removed" }));
    const auditRecord = vi.fn();
    const tool: ChatbotTool = {
      name: "excluir_cliente",
      description: "Exclui cliente",
      inputSchema: {},
      destructive: true,
      execute,
    };

    const registry = createToolRegistry({
      tools: [tool],
      context: createContext(),
      auditAdapter: { record: auditRecord },
    });

    await expect(registry["excluir_cliente"]!.execute?.({ id: "cli_1" } as never, {} as never)).resolves.toEqual({
      error: 'Tool "excluir_cliente" requires explicit human approval.',
      code: "tool_denied",
      retryable: false,
      metadata: { denied: true },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool.denied",
        toolName: "excluir_cliente",
        reason: 'Tool "excluir_cliente" requires explicit human approval.',
      }),
    );
  });

  it("estimates model cost from per-million token prices", () => {
    expect(
      estimateModelCost({
        inputTokens: 1_000,
        outputTokens: 2_000,
        inputCostPerMillion: 1,
        outputCostPerMillion: 2,
      }),
    ).toBe(0.005);
  });
});
