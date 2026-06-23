import { convertToModelMessages, stepCountIs, streamText, validateUIMessages } from "ai";
import type { UIMessage } from "ai";
import { createInMemoryPersistence } from "../adapters/inMemoryPersistence.js";
import { redactDebugTrace } from "../debug/redact.js";
import {
  createNoopAuditAdapter,
  createNoopRateLimitAdapter,
  createNoopToolExecutionRateLimitAdapter,
  createNoopUsageAdapter,
} from "../adapters/noop.js";
import { renderSystemPrompt } from "../prompt/defineSystemPrompt.js";
import { getTenantId } from "../tenant.js";
import { createToolRegistry, filterAuthorizedTools } from "../tools/createToolRegistry.js";
import type {
  AuditAdapter,
  AuditEvent,
  ChatbotErrorBody,
  ChatbotErrorCode,
  ChatbotHandler,
  ChatbotHandlerOptions,
  ChatbotModel,
  ChatbotRequestBody,
  ChatbotRuntimeContext,
  ChatbotUser,
  DebugTraceAdapter,
  PersistenceAdapter,
  UsageAdapter,
  UsageEvent,
} from "../types.js";

export function createChatbotHandler<TServices = unknown>(
  options: ChatbotHandlerOptions<TServices>,
): ChatbotHandler {
  const services = (options.services ?? {}) as TServices;
  const persistence = options.persistence ?? createInMemoryPersistence();
  const auditAdapter = options.auditAdapter ?? createNoopAuditAdapter();
  const debugAdapter = options.debugAdapter;
  const rateLimitAdapter = options.rateLimitAdapter ?? createNoopRateLimitAdapter();
  const toolExecutionRateLimitAdapter =
    options.toolExecutionRateLimitAdapter ?? createNoopToolExecutionRateLimitAdapter<TServices>();
  const usageAdapter = options.usageAdapter ?? createNoopUsageAdapter();
  const usageBudgetAdapter = options.usageBudgetAdapter;

  return async function chatbotHandler(request: Request): Promise<Response> {
    const requestStartedAt = Date.now();
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, { Allow: "POST" });
    }

    let body: ChatbotRequestBody;
    try {
      body = await readBody(request, options.maxRequestBytes);
    } catch (error) {
      await recordRequestFailed(auditAdapter, {
        error,
        requestStartedAt,
        user: null,
      });
      await recordDebugRequestFailed(debugAdapter, {
        error,
        code: "validation",
        requestStartedAt,
        user: null,
      });
      return jsonResponse(
        createErrorBody(error, "validation", false, "Invalid JSON body"),
        error instanceof RequestBodyTooLargeError ? 413 : 400,
      );
    }

    const user = options.authAdapter
      ? await options.authAdapter.authenticate({ request, body, services })
      : null;

    await recordAuditEvent(auditAdapter, {
      type: "request.started",
      user,
      createdAt: new Date(),
    });
    await recordDebugEvent(debugAdapter, {
      type: "request.started",
      user,
      createdAt: new Date(),
    });

    if (options.requireAuth && !user) {
      await recordAuditEvent(auditAdapter, {
        type: "permission.denied",
        scope: "request",
        reason: "Authentication required.",
        user,
        createdAt: new Date(),
      });
      await recordRequestFailed(auditAdapter, {
        error: "Authentication required.",
        requestStartedAt,
        user,
      });
      await recordDebugRequestFailed(debugAdapter, {
        error: "Authentication required.",
        code: "auth",
        requestStartedAt,
        user,
      });
      return jsonResponse(createErrorBody("Authentication required.", "auth", false), 401);
    }

    const rateLimit = await rateLimitAdapter.check({
      request,
      user,
      body,
      services,
    });

    if (!rateLimit.allowed) {
      await recordAuditEvent(auditAdapter, {
        type: "rate_limit.denied",
        ...(rateLimit.reason ? { reason: rateLimit.reason } : {}),
        ...(rateLimit.retryAfter == null ? {} : { retryAfter: rateLimit.retryAfter }),
        user,
        createdAt: new Date(),
      });
      await recordRequestFailed(auditAdapter, {
        error: rateLimit.reason ?? "Rate limit exceeded",
        requestStartedAt,
        user,
      });
      await recordDebugRequestFailed(debugAdapter, {
        error: rateLimit.reason ?? "Rate limit exceeded",
        code: "rate_limit",
        requestStartedAt,
        user,
      });
      return jsonResponse(
        createErrorBody(rateLimit.reason ?? "Rate limit exceeded", "rate_limit", true),
        429,
        rateLimit.retryAfter == null ? undefined : { "Retry-After": String(rateLimit.retryAfter) },
      );
    }

    const conversation = await persistence.getOrCreateConversation({
      ...(body.conversationId ? { conversationId: body.conversationId } : {}),
      user,
      context: body.context ?? {},
    });

    const tenantId = getTenantId(user);
    const context: ChatbotRuntimeContext<TServices> = {
      request,
      user,
      tenant: tenantId ? { id: tenantId } : null,
      conversationId: conversation.id,
      clientContext: body.context ?? {},
      services,
    };
    if (body.provider) {
      context.provider = body.provider;
    }
    if (body.trigger) {
      context.trigger = body.trigger;
    }

    const incomingMessages = body.messages ?? (body.message ? [body.message] : undefined);
    if (!incomingMessages?.length) {
      await recordRequestFailed(auditAdapter, {
        error: "Request body must include messages or message.",
        requestStartedAt,
        conversationId: conversation.id,
        user,
      });
      await recordDebugRequestFailed(debugAdapter, {
        error: "Request body must include messages or message.",
        code: "validation",
        requestStartedAt,
        conversationId: conversation.id,
        user,
      });
      return jsonResponse(
        createErrorBody("Request body must include messages or message.", "validation", false),
        400,
      );
    }

    const loadedMessages = await persistence.loadMessages({
      conversationId: conversation.id,
      user,
    });
    const mergedMessages = limitMessages(
      mergeMessages(loadedMessages, incomingMessages),
      options.maxHistoryMessages,
    );
    const authorizedTools = await filterAuthorizedTools({
      ...(options.tools ? { tools: options.tools } : {}),
      context,
      auditAdapter,
    });

    let validatedMessages: UIMessage[];
    try {
      const validationTools = createToolRegistry({
        context,
        auditAdapter,
        ...(debugAdapter ? { debugAdapter } : {}),
        tools: authorizedTools,
        toolExecutionRateLimitAdapter,
        ...(options.defaultToolTimeoutMs == null ? {} : { defaultToolTimeoutMs: options.defaultToolTimeoutMs }),
        ...(options.maxToolOutputBytes == null ? {} : { maxToolOutputBytes: options.maxToolOutputBytes }),
      });
      validatedMessages = await validateUIMessages({
        messages: mergedMessages,
        tools: validationTools as never,
      });
    } catch (error) {
      await recordRequestFailed(auditAdapter, {
        error,
        requestStartedAt,
        conversationId: conversation.id,
        user,
      });
      await recordDebugRequestFailed(debugAdapter, {
        error,
        code: "validation",
        requestStartedAt,
        conversationId: conversation.id,
        user,
      });
      return jsonResponse(
        createErrorBody(error, "validation", false, "Invalid UI messages"),
        400,
      );
    }

    await persistNewUserMessages({
      persistence,
      conversationId: conversation.id,
      user,
      loadedMessages,
      incomingMessages,
    });

    const model = await resolveModel(options, context);
    if (!model) {
      await recordRequestFailed(auditAdapter, {
        error: "No model configured for chatbot handler.",
        requestStartedAt,
        conversationId: conversation.id,
        user,
      });
      await recordDebugRequestFailed(debugAdapter, {
        error: "No model configured for chatbot handler.",
        code: "model",
        requestStartedAt,
        conversationId: conversation.id,
        user,
      });
      return jsonResponse(
        createErrorBody("No model configured for chatbot handler.", "model", false),
        500,
      );
    }

    const toolRegistry = createToolRegistry({
      context,
      auditAdapter,
      ...(debugAdapter ? { debugAdapter } : {}),
      tools: authorizedTools,
      toolExecutionRateLimitAdapter,
      ...(options.defaultToolTimeoutMs == null ? {} : { defaultToolTimeoutMs: options.defaultToolTimeoutMs }),
    });

    const system = await renderSystemPrompt(options.systemPrompt, context);
    const initialModelInfo = getModelInfo(model, context);
    const modelStartedAt = Date.now();
    await recordAuditEvent(auditAdapter, {
      type: "model.started",
      conversationId: conversation.id,
      ...initialModelInfo,
      user,
      createdAt: new Date(),
    });
    await recordDebugEvent(debugAdapter, {
      type: "model.started",
      conversationId: conversation.id,
      ...initialModelInfo,
      user,
      createdAt: new Date(),
    });
    await recordDebugEvent(debugAdapter, {
      type: "trace.snapshot",
      conversationId: conversation.id,
      trace: redactDebugTrace(
        createDebugTraceSnapshot({
          requestId: `${conversation.id}:${requestStartedAt}`,
          conversationId: conversation.id,
          systemPrompt: system ?? null,
          messages: validatedMessages,
          tools: authorizedTools,
          ...(initialModelInfo.provider ? { provider: initialModelInfo.provider } : {}),
          ...(initialModelInfo.model ? { model: initialModelInfo.model } : {}),
        }),
      ),
      user,
      createdAt: new Date(),
    });
    const result = streamText({
      model,
      messages: await convertToModelMessages(validatedMessages),
      tools: toolRegistry,
      stopWhen: stepCountIs(options.maxSteps ?? 5),
      ...(system ? { system } : {}),
      onError: async ({ error }) => {
        await recordAuditEvent(auditAdapter, {
          type: "model.error",
          conversationId: conversation.id,
          ...initialModelInfo,
          error: errorMessage(error),
          user,
          createdAt: new Date(),
        });
        await recordDebugEvent(debugAdapter, {
          type: "model.error",
          conversationId: conversation.id,
          ...initialModelInfo,
          error: errorMessage(error),
          code: classifyError(error),
          user,
          createdAt: new Date(),
        });
        await recordRequestFailed(auditAdapter, {
          error,
          requestStartedAt,
          conversationId: conversation.id,
          user,
        });
        await recordDebugRequestFailed(debugAdapter, {
          error,
          code: classifyError(error),
          requestStartedAt,
          conversationId: conversation.id,
          user,
        });
      },
      onFinish: async (event) => {
        const finishModelInfo = getFinishModelInfo(event, initialModelInfo);
        await recordAuditEvent(auditAdapter, {
          type: "model.finished",
          conversationId: conversation.id,
          ...finishModelInfo,
          durationMs: Date.now() - modelStartedAt,
          user,
          createdAt: new Date(),
        });
        await recordDebugEvent(debugAdapter, {
          type: "model.finished",
          conversationId: conversation.id,
          ...finishModelInfo,
          durationMs: Date.now() - modelStartedAt,
          user,
          createdAt: new Date(),
        });
        const costEstimate = await recordUsageEvent({
          usageAdapter,
          context,
          modelInfo: finishModelInfo,
          usage: event.totalUsage,
          toolCallsCount: countToolCalls(event),
        });
        if (usageBudgetAdapter) {
          const budget = await usageBudgetAdapter.check({
            ...buildUsageRecord({
              context,
              modelInfo: finishModelInfo,
              usage: event.totalUsage,
              toolCallsCount: countToolCalls(event),
            }),
            costEstimate,
            context,
          });

          if (!budget.allowed) {
            await recordAuditEvent(auditAdapter, {
              type: "rate_limit.denied",
              conversationId: conversation.id,
              scope: "request",
              reason: budget.reason ?? "Usage budget exceeded.",
              ...(budget.retryAfter == null ? {} : { retryAfter: budget.retryAfter }),
              user,
              createdAt: new Date(),
            });
            await recordDebugRequestFailed(debugAdapter, {
              error: budget.reason ?? "Usage budget exceeded.",
              code: "rate_limit",
              requestStartedAt,
              conversationId: conversation.id,
              user,
            });
          }
        }
      },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: validatedMessages,
      headers: {
        "x-conversation-id": conversation.id,
        ...(initialModelInfo.provider ? { "x-provider": initialModelInfo.provider } : {}),
        ...(initialModelInfo.model ? { "x-model": initialModelInfo.model } : {}),
        ...headersToRecord(options.headers),
      },
      onError: options.onError ?? defaultErrorMessage,
      onFinish: async ({ messages, responseMessage }) => {
        if (persistence.saveMessages) {
          await persistence.saveMessages({
            conversationId: conversation.id,
            user,
            messages,
          });
          await recordAuditEvent(auditAdapter, {
            type: "request.finished",
            conversationId: conversation.id,
            durationMs: Date.now() - requestStartedAt,
            user,
            createdAt: new Date(),
          });
          await recordDebugEvent(debugAdapter, {
            type: "request.finished",
            conversationId: conversation.id,
            durationMs: Date.now() - requestStartedAt,
            user,
            createdAt: new Date(),
          });
          return;
        }

        await persistence.saveMessage({
          conversationId: conversation.id,
          user,
          message: responseMessage,
        });
        await recordAuditEvent(auditAdapter, {
          type: "request.finished",
          conversationId: conversation.id,
          durationMs: Date.now() - requestStartedAt,
          user,
          createdAt: new Date(),
        });
        await recordDebugEvent(debugAdapter, {
          type: "request.finished",
          conversationId: conversation.id,
          durationMs: Date.now() - requestStartedAt,
          user,
          createdAt: new Date(),
        });
      },
    });
  };
}

const defaultMaxRequestBytes = 256 * 1024;

class RequestBodyTooLargeError extends Error {}

async function readBody(request: Request, maxRequestBytes = defaultMaxRequestBytes): Promise<ChatbotRequestBody> {
  const contentType = request.headers.get("content-type");
  if (contentType && !contentType.includes("application/json")) {
    throw new Error("Content-Type must be application/json.");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxRequestBytes) {
    throw new RequestBodyTooLargeError(`Request body must be ${maxRequestBytes} bytes or less.`);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxRequestBytes) {
    throw new RequestBodyTooLargeError(`Request body must be ${maxRequestBytes} bytes or less.`);
  }

  const value = JSON.parse(text) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JSON body must be an object.");
  }

  return value as ChatbotRequestBody;
}

function limitMessages(messages: UIMessage[], maxHistoryMessages: number | undefined): UIMessage[] {
  if (maxHistoryMessages == null || maxHistoryMessages < 1 || messages.length <= maxHistoryMessages) {
    return messages;
  }

  return messages.slice(-Math.trunc(maxHistoryMessages));
}

function mergeMessages(existing: UIMessage[], incoming: UIMessage[]): UIMessage[] {
  const byId = new Map<string, UIMessage>();
  for (const message of existing) {
    byId.set(message.id, message);
  }
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return [...byId.values()];
}

async function persistNewUserMessages(input: {
  persistence: PersistenceAdapter;
  conversationId: string;
  user: ChatbotUser | null;
  loadedMessages: UIMessage[];
  incomingMessages: UIMessage[];
}): Promise<void> {
  const existingIds = new Set(input.loadedMessages.map((message) => message.id));
  for (const message of input.incomingMessages) {
    if (message.role === "user" && !existingIds.has(message.id)) {
      await input.persistence.saveMessage({
        conversationId: input.conversationId,
        user: input.user,
        message,
      });
    }
  }
}

async function resolveModel<TServices>(
  options: ChatbotHandlerOptions<TServices>,
  context: ChatbotRuntimeContext<TServices>,
): Promise<ChatbotModel | undefined> {
  if (typeof options.model === "function") {
    return options.model({
      context,
      ...(context.provider ? { provider: context.provider } : {}),
    });
  }

  if (options.model) {
    return options.model;
  }

  const provider = context.provider ?? options.defaultProvider;
  if (provider && options.models?.[provider]) {
    return options.models[provider];
  }

  if (context.provider && options.fallbackProvider && options.models?.[options.fallbackProvider]) {
    return options.models[options.fallbackProvider];
  }

  if (!context.provider && options.fallbackProvider && options.models?.[options.fallbackProvider]) {
    return options.models[options.fallbackProvider];
  }

  if (options.fallbackModel) {
    return options.fallbackModel;
  }

  return undefined;
}

function jsonResponse(body: unknown, status: number, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headersToRecord(headers),
    },
  });
}

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }

  return Object.fromEntries(new Headers(headers).entries());
}

function defaultErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "An error occurred.";
}

function createErrorBody(
  error: unknown,
  code: ChatbotErrorCode,
  retryable: boolean,
  fallbackMessage?: string,
): ChatbotErrorBody {
  return {
    error:
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : fallbackMessage ?? "An error occurred.",
    code,
    retryable,
  };
}

type ModelInfo = {
  provider?: string;
  model?: string;
};

function getModelInfo<TServices>(model: ChatbotModel, context: ChatbotRuntimeContext<TServices>): ModelInfo {
  if (typeof model === "string") {
    return {
      ...(context.provider ? { provider: context.provider } : {}),
      model,
    };
  }

  return {
    provider: model.provider,
    model: model.modelId,
  };
}

function getFinishModelInfo(
  event: { model?: { provider?: string; modelId?: string } },
  fallback: ModelInfo,
): ModelInfo {
  const provider = event.model?.provider ?? fallback.provider;
  const model = event.model?.modelId ?? fallback.model;

  return {
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
  };
}

function countToolCalls(event: {
  steps?: Array<{ toolCalls?: unknown[] }>;
  toolCalls?: unknown[];
}): number {
  if (Array.isArray(event.steps)) {
    return event.steps.reduce((count, step) => count + (Array.isArray(step.toolCalls) ? step.toolCalls.length : 0), 0);
  }

  return Array.isArray(event.toolCalls) ? event.toolCalls.length : 0;
}

async function recordUsageEvent<TServices>(input: {
  usageAdapter: UsageAdapter<TServices>;
  context: ChatbotRuntimeContext<TServices>;
  modelInfo: ModelInfo;
  usage: { inputTokens?: unknown; outputTokens?: unknown } | undefined;
  toolCallsCount: number;
}): Promise<number | null> {
  const usage = buildUsageRecord({
    context: input.context,
    modelInfo: input.modelInfo,
    usage: input.usage,
    toolCallsCount: input.toolCallsCount,
  });

  let costEstimate: number | null = null;
  if (input.usageAdapter.estimateCost) {
    try {
      costEstimate = costValue(
        await input.usageAdapter.estimateCost({
          ...usage,
          context: input.context,
        }),
      );
    } catch {
      costEstimate = null;
    }
  }

  try {
    await input.usageAdapter.record({
      type: "usage.recorded",
      ...usage,
      cost_estimate: costEstimate,
      created_at: new Date(),
    });
  } catch {
    // Usage observers are optional and must not fail an otherwise successful stream.
  }

  return costEstimate;
}

function buildUsageRecord<TServices>(input: {
  context: ChatbotRuntimeContext<TServices>;
  modelInfo: ModelInfo;
  usage: { inputTokens?: unknown; outputTokens?: unknown } | undefined;
  toolCallsCount: number;
}): Omit<UsageEvent, "type" | "cost_estimate" | "created_at"> {
  return {
    conversation_id: input.context.conversationId,
    user_id: input.context.user?.id ?? null,
    tenant: input.context.tenant?.id ?? input.context.user?.tenantId ?? null,
    provider: input.modelInfo.provider ?? null,
    model: input.modelInfo.model ?? null,
    input_tokens: tokenCount(input.usage?.inputTokens),
    output_tokens: tokenCount(input.usage?.outputTokens),
    tool_calls_count: input.toolCallsCount,
  };
}

function tokenCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === "object" && "total" in value) {
    const total = (value as { total?: unknown }).total;
    return typeof total === "number" && Number.isFinite(total) ? total : null;
  }

  return null;
}

function costValue(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function createDebugTraceSnapshot<TServices>(input: {
  requestId: string;
  conversationId: string;
  provider?: string;
  model?: string;
  systemPrompt: string | null;
  messages: UIMessage[];
  tools: Array<{
    name: string;
    description: string;
    destructive?: boolean;
    requiresConfirmation?: boolean;
    timeoutMs?: number;
    enabled?: boolean | ((context: ChatbotRuntimeContext<TServices>) => boolean | Promise<boolean>);
  }>;
}) {
  return {
    requestId: input.requestId,
    conversationId: input.conversationId,
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.model ? { model: input.model } : {}),
    systemPrompt: input.systemPrompt,
    messages: input.messages.map((message) => ({
      id: message.id,
      role: message.role,
      parts: message.parts.map((part, index) => ({
        type: isRecord(part) && typeof part.type === "string" ? part.type : `part-${index}`,
        ...serializeDebugValue(part),
      })),
    })),
    tools: input.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      ...(tool.destructive ? { destructive: true } : {}),
      ...(tool.requiresConfirmation ? { requiresConfirmation: true } : {}),
      ...(tool.timeoutMs == null ? {} : { timeoutMs: tool.timeoutMs }),
      ...(typeof tool.enabled === "boolean" ? { enabled: tool.enabled } : {}),
    })),
    createdAt: new Date(),
  };
}

function serializeDebugValue(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    if (typeof value === "string") {
      return { value };
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return { value };
    }
    return {};
  }

  return { ...value } as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function recordAuditEvent(auditAdapter: AuditAdapter, event: AuditEvent): Promise<void> {
  try {
    await auditAdapter.record(event);
  } catch {
    // Observer failures must not change request handling behavior.
  }
}

async function recordRequestFailed(
  auditAdapter: AuditAdapter,
  input: {
    error: unknown;
    requestStartedAt: number;
    conversationId?: string;
    user: ChatbotUser | null;
  },
): Promise<void> {
  await recordAuditEvent(auditAdapter, {
    type: "request.failed",
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    error: errorMessage(input.error),
    durationMs: Date.now() - input.requestStartedAt,
    user: input.user,
    createdAt: new Date(),
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function classifyError(error: unknown): ChatbotErrorCode {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("timeout")) return "timeout";
    if (message.includes("auth")) return "auth";
    if (message.includes("rate limit")) return "rate_limit";
    if (message.includes("network")) return "network";
    if (message.includes("validation")) return "validation";
  }

  return "unknown";
}

async function recordDebugEvent(
  debugAdapter: DebugTraceAdapter | undefined,
  event: Parameters<DebugTraceAdapter["record"]>[0],
): Promise<void> {
  if (!debugAdapter) return;

  try {
    await debugAdapter.record(event);
  } catch {
    // Debug observers must not affect request handling.
  }
}

async function recordDebugRequestFailed(
  debugAdapter: DebugTraceAdapter | undefined,
  input: {
    error: unknown;
    requestStartedAt: number;
    conversationId?: string;
    user: ChatbotUser | null;
    code: ChatbotErrorCode;
  },
): Promise<void> {
  await recordDebugEvent(debugAdapter, {
    type: "request.failed",
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    error: errorMessage(input.error),
    code: input.code,
    durationMs: Date.now() - input.requestStartedAt,
    user: input.user,
    createdAt: new Date(),
  });
}
