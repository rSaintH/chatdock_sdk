import { tool } from "ai";
import type { ToolSet } from "ai";
import { createAuditedExecutor } from "./createAuditedExecutor.js";
import { toolDenied } from "./toolResult.js";
import type {
  AuditAdapter,
  AuditEvent,
  ChatbotRuntimeContext,
  ChatbotTool,
  DebugTraceAdapter,
  ToolAuthorizationResult,
  ToolExecutionRateLimitAdapter,
} from "../types.js";

function isAllowed(result: ToolAuthorizationResult): boolean {
  return typeof result === "boolean" ? result : result.allowed;
}

function deniedReason(result: ToolAuthorizationResult): string | undefined {
  return typeof result === "boolean" ? undefined : result.reason;
}

function deniedCode(result: ToolAuthorizationResult): string | undefined {
  return typeof result === "boolean" ? undefined : result.code;
}

function deniedRetryable(result: ToolAuthorizationResult): boolean | undefined {
  return typeof result === "boolean" ? undefined : result.retryable;
}

function deniedMetadata(result: ToolAuthorizationResult): Record<string, unknown> | undefined {
  return typeof result === "boolean" ? undefined : result.metadata;
}

export function createToolRegistry<TServices = unknown>(input: {
  tools?: ChatbotTool<unknown, unknown, TServices>[];
  context: ChatbotRuntimeContext<TServices>;
  auditAdapter: AuditAdapter;
  debugAdapter?: DebugTraceAdapter;
  toolExecutionRateLimitAdapter?: ToolExecutionRateLimitAdapter<TServices>;
  defaultToolTimeoutMs?: number;
  maxToolOutputBytes?: number;
}): ToolSet {
  const registry: ToolSet = {};
  const executeWithAudit = createAuditedExecutor({
    auditAdapter: input.auditAdapter,
    ...(input.debugAdapter ? { debugAdapter: input.debugAdapter } : {}),
    context: input.context,
    ...(input.defaultToolTimeoutMs == null ? {} : { defaultToolTimeoutMs: input.defaultToolTimeoutMs }),
    ...(input.maxToolOutputBytes == null ? {} : { maxToolOutputBytes: input.maxToolOutputBytes }),
  });

  for (const chatbotTool of input.tools ?? []) {
    if (registry[chatbotTool.name]) {
      throw new Error(`Duplicate tool registered: ${chatbotTool.name}`);
    }

    registry[chatbotTool.name] = tool({
      description: chatbotTool.description,
      inputSchema: chatbotTool.inputSchema as never,
      execute: async (toolInput: unknown, options) => {
        const authorization = await authorizeTool({
          tool: chatbotTool,
          context: input.context,
          input: toolInput,
          phase: "execute",
        });
        if (!isAllowed(authorization)) {
          const reason = deniedReason(authorization) ?? `Tool "${chatbotTool.name}" is not authorized for this request.`;
          const code = deniedCode(authorization);
          const retryable = deniedRetryable(authorization);
          const metadata = deniedMetadata(authorization);
          await recordAuditEvent(input.auditAdapter, {
            type: "tool.denied",
            conversationId: input.context.conversationId,
            toolName: chatbotTool.name,
            ...(options?.toolCallId ? { toolCallId: options.toolCallId } : {}),
            input: toolInput,
            reason,
            ...(code ? { code } : {}),
            user: input.context.user,
            createdAt: new Date(),
          });
          await recordAuditEvent(input.auditAdapter, {
            type: "permission.denied",
            conversationId: input.context.conversationId,
            scope: "tool",
            toolName: chatbotTool.name,
            reason,
            user: input.context.user,
            createdAt: new Date(),
          });
          return toolDenied({
            message: reason,
            ...(code ? { code } : {}),
            ...(retryable == null ? {} : { retryable }),
            ...(metadata ? { metadata } : {}),
          });
        }

        if (input.toolExecutionRateLimitAdapter) {
          const rateLimit = await input.toolExecutionRateLimitAdapter.check({
            tool: chatbotTool,
            input: toolInput,
            context: input.context,
            options,
          });

          if (!rateLimit.allowed) {
            await recordAuditEvent(input.auditAdapter, {
              type: "rate_limit.denied",
              conversationId: input.context.conversationId,
              scope: "tool",
              toolName: chatbotTool.name,
              ...(rateLimit.reason ? { reason: rateLimit.reason } : {}),
              ...(rateLimit.retryAfter == null ? {} : { retryAfter: rateLimit.retryAfter }),
              user: input.context.user,
              createdAt: new Date(),
            });
            throw new Error(rateLimit.reason ?? `Tool "${chatbotTool.name}" rate limit exceeded.`);
          }
        }

        return executeWithAudit(chatbotTool, toolInput, options);
      },
    }) as ToolSet[string];
  }

  return registry;
}

export async function filterAuthorizedTools<TServices = unknown>(input: {
  tools?: ChatbotTool<unknown, unknown, TServices>[];
  context: ChatbotRuntimeContext<TServices>;
  auditAdapter?: AuditAdapter;
}): Promise<ChatbotTool<unknown, unknown, TServices>[]> {
  const authorizedTools: ChatbotTool<unknown, unknown, TServices>[] = [];

  for (const chatbotTool of input.tools ?? []) {
    const authorization = await authorizeTool({ tool: chatbotTool, context: input.context, phase: "filter" });
    if (isAllowed(authorization)) {
      authorizedTools.push(chatbotTool);
      continue;
    }

    if (input.auditAdapter) {
      const reason = deniedReason(authorization) ?? `Tool "${chatbotTool.name}" is not authorized for this request.`;
      await recordAuditEvent(input.auditAdapter, {
        type: "tool.filtered",
        conversationId: input.context.conversationId,
        toolName: chatbotTool.name,
        reason,
        user: input.context.user,
        createdAt: new Date(),
      });
      await recordAuditEvent(input.auditAdapter, {
        type: "permission.denied",
        conversationId: input.context.conversationId,
        scope: "tool",
        toolName: chatbotTool.name,
        reason,
        user: input.context.user,
        createdAt: new Date(),
      });
    }
  }

  return authorizedTools;
}

async function authorizeTool<TServices = unknown>(input: {
  tool: ChatbotTool<unknown, unknown, TServices>;
  context: ChatbotRuntimeContext<TServices>;
  input?: unknown;
  phase: "filter" | "execute";
}): Promise<ToolAuthorizationResult> {
  const enabled =
    typeof input.tool.enabled === "function"
      ? await input.tool.enabled(input.context)
      : input.tool.enabled;
  if (enabled === false) {
    return { allowed: false, reason: `Tool "${input.tool.name}" is disabled.` };
  }

  if (requiresExplicitApproval(input.tool) && !hasExplicitApproval(input.tool, input.context)) {
    return {
      allowed: false,
      reason: `Tool "${input.tool.name}" requires explicit human approval.`,
    };
  }

  return input.tool.authorize
    ? input.tool.authorize({
        tool: input.tool,
        context: input.context,
        input: input.input,
        phase: input.phase,
      })
    : true;
}

function requiresExplicitApproval<TServices>(tool: ChatbotTool<unknown, unknown, TServices>) {
  return tool.requiresConfirmation === true || tool.destructive === true || tool.dangerous === true;
}

function hasExplicitApproval<TServices>(
  tool: ChatbotTool<unknown, unknown, TServices>,
  context: ChatbotRuntimeContext<TServices>,
) {
  const approvedTools = context.clientContext.approvedToolNames;
  return (
    context.clientContext.humanApproved === true ||
    (Array.isArray(approvedTools) && approvedTools.includes(tool.name))
  );
}

async function recordAuditEvent(auditAdapter: AuditAdapter, event: AuditEvent): Promise<void> {
  try {
    await auditAdapter.record(event);
  } catch {
    // Observer failures must not change tool authorization behavior.
  }
}
