import { jsonSchema } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV3 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { createInMemoryPersistence } from "../adapters/inMemoryPersistence.js";
import { createChatbotHandler } from "./createChatbotHandler.js";

describe("createChatbotHandler", () => {
  it("returns 401 when authentication is required and no user is resolved", async () => {
    const model = new MockLanguageModelV3({
      doStream: {
        stream: convertArrayToReadableStream([]),
      },
    });
    const auditRecord = vi.fn();
    const handler = createChatbotHandler({
      model,
      requireAuth: true,
      auditAdapter: {
        record: auditRecord,
      },
      authAdapter: {
        authenticate: async () => null,
      },
    });

    const response = await handler(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            id: "user-msg-1",
            role: "user",
            parts: [{ type: "text", text: "Oi" }],
          },
        }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
      code: "auth",
      retryable: false,
    });
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "permission.denied",
        scope: "request",
        reason: "Authentication required.",
        user: null,
      }),
    );
  });

  it("records rate limit denials", async () => {
    const model = new MockLanguageModelV3({
      doStream: {
        stream: convertArrayToReadableStream([]),
      },
    });
    const auditRecord = vi.fn();
    const handler = createChatbotHandler({
      model,
      auditAdapter: {
        record: auditRecord,
      },
      rateLimitAdapter: {
        check: async () => ({ allowed: false, reason: "Too many requests.", retryAfter: 30 }),
      },
    });

    const response = await handler(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            id: "user-msg-1",
            role: "user",
            parts: [{ type: "text", text: "Oi" }],
          },
        }),
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    await expect(response.json()).resolves.toEqual({
      error: "Too many requests.",
      code: "rate_limit",
      retryable: true,
    });
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "rate_limit.denied",
        reason: "Too many requests.",
        retryAfter: 30,
        user: null,
      }),
    );
  });

  it("streams a response and persists the conversation", async () => {
    const persistence = createInMemoryPersistence();
    const usageRecord = vi.fn();
    const estimateCost = vi.fn(() => 0.0001);
    const model = new MockLanguageModelV3({
      doStream: {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: "Olá" },
          { type: "text-end", id: "text-1" },
          {
            type: "finish",
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: {
                total: 1,
                text: 1,
                reasoning: 0,
              },
            },
            finishReason: "stop",
          },
        ]),
      },
    });

    const handler = createChatbotHandler({
      model,
      persistence,
      usageAdapter: {
        estimateCost,
        record: usageRecord,
      },
      systemPrompt: "Você é um assistente.",
    });

    const request = new Request("https://example.com/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          id: "user-msg-1",
          role: "user",
          parts: [{ type: "text", text: "Oi" }],
        },
      }),
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-conversation-id")).toBeTruthy();

    const body = await response.text();
    expect(body).toContain("Olá");
    expect(estimateCost).toHaveBeenCalledWith(
      expect.objectContaining({
        input_tokens: 1,
        output_tokens: 1,
        tool_calls_count: 0,
      }),
    );
    expect(usageRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "usage.recorded",
        user_id: null,
        tenant: null,
        input_tokens: 1,
        output_tokens: 1,
        tool_calls_count: 0,
        cost_estimate: 0.0001,
      }),
    );

    const conversationId = response.headers.get("x-conversation-id");
    expect(conversationId).toBeTruthy();

    const savedMessages = await persistence.loadMessages({
      conversationId: conversationId!,
      user: null,
    });

    expect(savedMessages).toHaveLength(2);
    expect(savedMessages[0]?.role).toBe("user");
    expect(savedMessages[1]?.role).toBe("assistant");
  });

  it("falls back to a configured provider when the requested provider is missing", async () => {
    const model = new MockLanguageModelV3({
      doStream: {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: "Olá de fallback" },
          { type: "text-end", id: "text-1" },
          {
            type: "finish",
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: {
                total: 1,
                text: 1,
                reasoning: 0,
              },
            },
            finishReason: "stop",
          },
        ]),
      },
    });

    const handler = createChatbotHandler({
      model: undefined,
      defaultProvider: "primary",
      fallbackProvider: "backup",
      models: {
        backup: model,
      },
      persistence: createInMemoryPersistence(),
      systemPrompt: "Você é um assistente.",
    });

    const response = await handler(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "missing-provider",
          message: {
            id: "user-msg-1",
            role: "user",
            parts: [{ type: "text", text: "Oi" }],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-model")).toBeTruthy();

    const body = await response.text();
    expect(body).toContain("Olá de fallback");
  });

  it("reports usage budget exceedance after recording usage", async () => {
    const persistence = createInMemoryPersistence();
    const usageRecord = vi.fn();
    const budgetCheck = vi.fn(async () => ({ allowed: false, reason: "Tenant budget exceeded." }));
    const auditRecord = vi.fn();
    const model = new MockLanguageModelV3({
      doStream: {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: "Olá" },
          { type: "text-end", id: "text-1" },
          {
            type: "finish",
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: {
                total: 1,
                text: 1,
                reasoning: 0,
              },
            },
            finishReason: "stop",
          },
        ]),
      },
    });

    const handler = createChatbotHandler({
      model,
      persistence,
      auditAdapter: { record: auditRecord },
      usageAdapter: {
        estimateCost: () => 0.0001,
        record: usageRecord,
      },
      usageBudgetAdapter: {
        check: budgetCheck,
      },
      systemPrompt: "Você é um assistente.",
    });

    const response = await handler(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            id: "user-msg-1",
            role: "user",
            parts: [{ type: "text", text: "Oi" }],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Olá");
    expect(budgetCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        costEstimate: 0.0001,
        tenant: null,
      }),
    );
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "rate_limit.denied",
        scope: "request",
        reason: "Tenant budget exceeded.",
      }),
    );
  });

  it("emits a redacted debug trace snapshot before streaming the model response", async () => {
    const debugRecord = vi.fn();
    const model = new MockLanguageModelV3({
      doStream: {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: "Ok" },
          { type: "text-end", id: "text-1" },
          {
            type: "finish",
            usage: {
              inputTokens: { total: 1 },
              outputTokens: { total: 1 },
            },
            finishReason: "stop",
          },
        ]),
      },
    });

    const handler = createChatbotHandler({
      model,
      debugAdapter: { record: debugRecord },
      systemPrompt: "Use this token: Bearer sk_test_12345678",
    });

    const response = await handler(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            id: "user-msg-1",
            role: "user",
            parts: [{ type: "text", text: "Authorization: Bearer sk_test_12345678" }],
          },
        }),
      }),
    );

    await response.text();

    const snapshotEvent = debugRecord.mock.calls
      .map(([event]) => event)
      .find((event) => event?.type === "trace.snapshot");

    expect(snapshotEvent).toBeTruthy();
    expect(snapshotEvent).toEqual(
      expect.objectContaining({
        type: "trace.snapshot",
        trace: expect.objectContaining({
          systemPrompt: expect.not.stringContaining("sk_test_12345678"),
          messages: expect.arrayContaining([
            expect.objectContaining({
              parts: expect.arrayContaining([
                expect.objectContaining({
                  text: expect.not.stringContaining("sk_test_12345678"),
                }),
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it("filters unauthorized tools before calling the model", async () => {
    const auditRecord = vi.fn();
    const model = new MockLanguageModelV3({
      doStream: {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: "Ok" },
          { type: "text-end", id: "text-1" },
          {
            type: "finish",
            usage: {
              inputTokens: { total: 1 },
              outputTokens: { total: 1 },
            },
            finishReason: "stop",
          },
        ]),
      },
    });

    const handler = createChatbotHandler({
      model,
      auditAdapter: { record: auditRecord },
      tools: [
        {
          name: "autorizada",
          description: "Autorizada.",
          inputSchema: jsonSchema({ type: "object", properties: {} }),
          execute: async () => ({ ok: true }),
        },
        {
          name: "bloqueada",
          description: "Bloqueada.",
          inputSchema: jsonSchema({ type: "object", properties: {} }),
          authorize: async () => ({ allowed: false, reason: "Missing role." }),
          execute: async () => ({ ok: false }),
        },
      ],
    });

    const response = await handler(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            id: "user-msg-1",
            role: "user",
            parts: [{ type: "text", text: "Oi" }],
          },
        }),
      }),
    );

    await response.text();

    expect(response.status).toBe(200);
    expect(model.doStreamCalls).toHaveLength(1);
    expect(model.doStreamCalls[0]?.tools?.map((tool) => tool.name)).toEqual(["autorizada"]);
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "permission.denied",
        scope: "tool",
        toolName: "bloqueada",
        reason: "Missing role.",
      }),
    );
  });

  it("resolves tools dynamically before validation, debug tracing, and model calls", async () => {
    const auditRecord = vi.fn();
    const debugRecord = vi.fn();
    const detectIntent = vi.fn(async () => ({ intent: "clients" }));
    const resolveTools = vi.fn(async ({ tools }) => ({
      tools: tools.filter((tool) => tool.name === "search_docs"),
    }));
    const model = new MockLanguageModelV3({
      doStream: {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: "Ok" },
          { type: "text-end", id: "text-1" },
          { type: "finish", usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } }, finishReason: "stop" },
        ]),
      },
    });

    const handler = createChatbotHandler({
      model,
      auditAdapter: { record: auditRecord },
      debugAdapter: { record: debugRecord },
      services: { crm: true },
      authAdapter: {
        authenticate: async () => ({
          id: "user_1",
          roles: ["admin"],
          tenantId: "tenant_1",
        }),
      },
      tools: [
        {
          name: "search_clients",
          description: "Search clients.",
          inputSchema: jsonSchema({ type: "object", properties: {} }),
          execute: async () => ({ ok: true }),
        },
        {
          name: "search_docs",
          description: "Search docs.",
          inputSchema: jsonSchema({ type: "object", properties: {} }),
          execute: async () => ({ ok: true }),
        },
        {
          name: "admin_only",
          description: "Admin only.",
          inputSchema: jsonSchema({ type: "object", properties: {} }),
          execute: async () => ({ ok: true }),
        },
      ],
      toolsByIntent: {
        clients: ["search_clients", "search_docs"],
      },
      runtimeConfigAdapter: {
        get: async () => ({
          tools: ["search_clients", "search_docs", "admin_only"],
        }),
      },
      detectIntent,
      resolveTools,
    });

    const response = await handler(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "auto",
          trigger: "composer",
          context: { pathname: "/clients" },
          message: {
            id: "user-msg-1",
            role: "user",
            parts: [{ type: "text", text: "Procure um cliente" }],
          },
        }),
      }),
    );

    await response.text();

    expect(response.status).toBe(200);
    expect(model.doStreamCalls).toHaveLength(1);
    expect(model.doStreamCalls[0]?.tools?.map((tool) => tool.name)).toEqual(["search_docs"]);
    expect(detectIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          user: { id: "user_1", roles: ["admin"], tenantId: "tenant_1" },
          tenant: { id: "tenant_1" },
          provider: "auto",
          trigger: "composer",
          clientContext: { pathname: "/clients" },
          services: { crm: true },
        }),
      }),
    );
    expect(resolveTools).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { id: "user_1", roles: ["admin"], tenantId: "tenant_1" },
        intent: "clients",
        tools: [
          expect.objectContaining({ name: "search_clients" }),
          expect.objectContaining({ name: "search_docs" }),
        ],
      }),
    );
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tools.resolved",
        intent_detected: "clients",
        tools_total: 3,
        tools_sent: 1,
        tools_unavailable: expect.arrayContaining([
          expect.objectContaining({
            name: "admin_only",
            reason: 'Tool is not enabled for intent "clients".',
          }),
          expect.objectContaining({
            name: "search_clients",
            reason: "Filtered by resolveTools hook.",
          }),
        ]),
      }),
    );

    const snapshotEvent = debugRecord.mock.calls
      .map(([event]) => event)
      .find((event) => event?.type === "trace.snapshot");

    expect(snapshotEvent).toEqual(
      expect.objectContaining({
        trace: expect.objectContaining({
          tools: [expect.objectContaining({ name: "search_docs" })],
        }),
      }),
    );
  });

  it("returns a typed error when dynamic tool resolution fails", async () => {
    const auditRecord = vi.fn();
    const model = new MockLanguageModelV3({
      doStream: {
        stream: convertArrayToReadableStream([]),
      },
    });
    const handler = createChatbotHandler({
      model,
      auditAdapter: { record: auditRecord },
      detectIntent: async () => {
        throw new Error("intent service unavailable");
      },
    });

    const response = await handler(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            id: "user-msg-1",
            role: "user",
            parts: [{ type: "text", text: "Oi" }],
          },
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "intent service unavailable",
      code: "unknown",
      retryable: true,
    });
    expect(model.doStreamCalls).toHaveLength(0);
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "request.failed",
        error: "intent service unavailable",
      }),
    );
  });

  it("returns a typed error when no model is configured", async () => {
    const handler = createChatbotHandler({});

    const response = await handler(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            id: "user-msg-1",
            role: "user",
            parts: [{ type: "text", text: "Oi" }],
          },
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "No model configured for chatbot handler.",
      code: "model",
      retryable: false,
    });
  });

  it("rejects oversized JSON bodies before parsing the request", async () => {
    const handler = createChatbotHandler({
      maxRequestBytes: 16,
      model: new MockLanguageModelV3({
        doStream: {
          stream: convertArrayToReadableStream([]),
        },
      }),
    });

    const response = await handler(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            id: "user-msg-1",
            role: "user",
            parts: [{ type: "text", text: "Oi" }],
          },
        }),
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Request body must be 16 bytes or less.",
      code: "validation",
      retryable: false,
    });
  });

  it("limits loaded history before validating messages for the model", async () => {
    const persistence = createInMemoryPersistence();
    const conversation = await persistence.getOrCreateConversation({
      conversationId: "conv_1",
      user: null,
      context: {},
    });
    await persistence.saveMessage({
      conversationId: conversation.id,
      user: null,
      message: {
        id: "invalid-old-message",
        role: "not-a-valid-role",
        parts: [],
      } as never,
    });
    const model = new MockLanguageModelV3({
      doStream: {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: "Ok" },
          { type: "text-end", id: "text-1" },
          { type: "finish", usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } }, finishReason: "stop" },
        ]),
      },
    });
    const handler = createChatbotHandler({
      model,
      persistence,
      maxHistoryMessages: 1,
    });

    const response = await handler(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: "conv_1",
          message: {
            id: "user-msg-1",
            role: "user",
            parts: [{ type: "text", text: "Oi" }],
          },
        }),
      }),
    );

    await response.text();

    expect(response.status).toBe(200);
    expect(model.doStreamCalls).toHaveLength(1);
  });
});
