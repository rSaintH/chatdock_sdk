import { describe, expect, it, vi } from "vitest";
import { createAuditedExecutor } from "./createAuditedExecutor.js";
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

describe("createAuditedExecutor", () => {
  it("passes an ergonomic AbortSignal to tool execution", async () => {
    const execute = vi.fn(async ({ signal }) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      return { data: "ok" };
    });
    const tool: ChatbotTool = {
      name: "buscar_clientes",
      description: "Busca clientes",
      inputSchema: {},
      execute,
    };

    const executeWithAudit = createAuditedExecutor({
      context: createContext(),
      auditAdapter: { record: vi.fn() },
    });

    await expect(executeWithAudit(tool, { query: "abc" }, { toolCallId: "call_1" } as never)).resolves.toEqual({
      data: "ok",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("fails with a clear error and aborts the signal when a tool timeout is exceeded", async () => {
    let toolSignal: AbortSignal | undefined;
    const auditRecord = vi.fn();
    const debugRecord = vi.fn();
    const tool: ChatbotTool = {
      name: "slow_tool",
      description: "Slow tool",
      inputSchema: {},
      timeoutMs: 5,
      execute: async ({ signal }) => {
        toolSignal = signal;
        return new Promise(() => undefined);
      },
    };

    const executeWithAudit = createAuditedExecutor({
      context: createContext(),
      auditAdapter: { record: auditRecord },
      debugAdapter: { record: debugRecord },
    });

    await expect(executeWithAudit(tool, {}, { toolCallId: "call_1" } as never)).rejects.toThrow(
      'Tool "slow_tool" timed out after 5ms.',
    );

    expect(toolSignal?.aborted).toBe(true);
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool.failed",
        toolName: "slow_tool",
        error: 'Tool "slow_tool" timed out after 5ms.',
      }),
    );
    expect(debugRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool.failed",
        toolName: "slow_tool",
        code: "timeout",
      }),
    );
  });

  it("uses the default tool timeout when the tool has no timeout", async () => {
    const tool: ChatbotTool = {
      name: "default_timeout_tool",
      description: "Default timeout tool",
      inputSchema: {},
      execute: async () => new Promise(() => undefined),
    };

    const executeWithAudit = createAuditedExecutor({
      context: createContext(),
      auditAdapter: { record: vi.fn() },
      defaultToolTimeoutMs: 5,
    });

    await expect(executeWithAudit(tool, {}, { toolCallId: "call_1" } as never)).rejects.toThrow(
      'Tool "default_timeout_tool" timed out after 5ms.',
    );
  });

  it("rejects invalid tool output when an output schema is provided", async () => {
    const auditRecord = vi.fn();
    const tool: ChatbotTool = {
      name: "schema_tool",
      description: "Schema tool",
      inputSchema: {},
      outputSchema: {
        safeParse(value: unknown) {
          return typeof value === "object" && value !== null && "ok" in (value as Record<string, unknown>)
            ? { success: true as const, data: value }
            : { success: false as const, error: { message: "Expected an ok property." } };
        },
      },
      execute: async () => ({ data: { nope: true } }),
    };

    const executeWithAudit = createAuditedExecutor({
      context: createContext(),
      auditAdapter: { record: auditRecord },
    });

    await expect(executeWithAudit(tool, {}, { toolCallId: "call_1" } as never)).rejects.toThrow(
      'Tool "schema_tool" returned invalid output: Expected an ok property.',
    );
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool.failed",
        toolName: "schema_tool",
        error: expect.stringContaining("invalid output"),
      }),
    );
  });

  it("truncates oversized tool output and records output metadata", async () => {
    const auditRecord = vi.fn();
    const debugRecord = vi.fn();
    const tool: ChatbotTool = {
      name: "big_tool",
      description: "Big tool",
      inputSchema: {},
      execute: async () => ({ data: { payload: "x".repeat(128) } }),
    };

    const executeWithAudit = createAuditedExecutor({
      context: createContext(),
      auditAdapter: { record: auditRecord },
      debugAdapter: { record: debugRecord },
      maxToolOutputBytes: 48,
    });

    const result = await executeWithAudit(tool, {}, { toolCallId: "call_1" } as never);
    expect(result).toEqual(
      expect.objectContaining({
        data: expect.any(String),
        metadata: expect.objectContaining({
          outputTruncated: true,
          outputSizeBytes: expect.any(Number),
          outputTruncatedToBytes: 48,
        }),
      }),
    );
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool.finished",
        toolName: "big_tool",
        outputTruncated: true,
        outputSizeBytes: expect.any(Number),
      }),
    );
    expect(debugRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool.finished",
        toolName: "big_tool",
        outputTruncated: true,
      }),
    );
  });
});
