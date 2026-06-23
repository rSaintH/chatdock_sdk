import { describe, expect, it, vi } from "vitest";
import { defineTool } from "../tools/defineTool.js";
import {
  createMockRuntimeContext,
  createMockToolContext,
  expectToolAuthorized,
  expectToolDenied,
  runToolTest,
} from "./index.js";
import type { ChatbotTool } from "../types.js";

describe("testing helpers", () => {
  it("creates a mock runtime context with useful defaults", () => {
    const context = createMockRuntimeContext();

    expect(context.request.url).toBe("https://example.test/chat");
    expect(context.user).toEqual({ id: "test_user" });
    expect(context.conversationId).toBe("test_conversation");
    expect(context.clientContext).toEqual({});
    expect(context.services).toEqual({});
    expect(context.tenant).toBeNull();
  });

  it("derives tenant from the mock user by default", () => {
    const context = createMockRuntimeContext({
      user: { id: "user_1", tenantId: "tenant_1" },
    });

    expect(context.tenant).toEqual({ id: "tenant_1" });
  });

  it("exposes createMockToolContext as an alias", () => {
    const context = createMockToolContext({
      user: null,
      clientContext: { humanApproved: true },
    });

    expect(context.user).toBeNull();
    expect(context.clientContext).toEqual({ humanApproved: true });
  });

  it("runs a tool with mocked input, user, services, and client context", async () => {
    const tool = defineTool<{ name: string }, { greeting: string }, { prefix: string }>({
      name: "greet",
      description: "Greets a user.",
      inputSchema: {},
      authorize: ({ context }) => context.clientContext.allowed === true,
      execute: async ({ input, context, options }) => ({
        greeting: `${context.services.prefix}, ${input.name} (${context.user?.id}:${options.toolCallId})`,
      }),
    });

    await expect(
      runToolTest(tool, {
        input: { name: "Ada" },
        user: { id: "user_1" },
        services: { prefix: "Hello" },
        clientContext: { allowed: true },
      }),
    ).resolves.toEqual({ greeting: "Hello, Ada (user_1:greet_test_call)" });
  });

  it("asserts authorized and denied tools without executing them", async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const tool: ChatbotTool = {
      name: "admin_report",
      description: "Reads an admin report.",
      inputSchema: {},
      authorize: ({ context }) =>
        context.user?.roles?.includes("admin")
          ? true
          : { allowed: false, reason: "Missing admin role." },
      execute,
    };

    await expect(expectToolAuthorized(tool, { user: { id: "admin_1", roles: ["admin"] } })).resolves.toEqual(
      expect.objectContaining({
        result: true,
      }),
    );
    await expect(expectToolDenied(tool, { user: { id: "user_1", roles: ["support"] } })).resolves.toEqual(
      expect.objectContaining({
        reason: "Missing admin role.",
      }),
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("denies destructive tools unless explicit approval is mocked", async () => {
    const tool: ChatbotTool = {
      name: "delete_account",
      description: "Deletes an account.",
      inputSchema: {},
      destructive: true,
      execute: async () => ({ ok: true }),
    };

    await expect(expectToolDenied(tool)).resolves.toEqual(
      expect.objectContaining({
        reason: 'Tool "delete_account" requires explicit human approval.',
      }),
    );
    await expect(expectToolAuthorized(tool, { clientContext: { approvedToolNames: ["delete_account"] } })).resolves.toEqual(
      expect.objectContaining({
        result: true,
      }),
    );
  });

  it("does not run denied tools", async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const tool: ChatbotTool<{ id: string }, { ok: boolean }> = {
      name: "sync_private_data",
      description: "Syncs private data.",
      inputSchema: {},
      authorize: () => ({ allowed: false, reason: "No access." }),
      execute,
    };

    await expect(runToolTest(tool, { input: { id: "private_1" } })).rejects.toThrow("No access.");
    expect(execute).not.toHaveBeenCalled();
  });
});
