import type { ToolExecutionOptions } from "ai";
import type {
  ChatbotClientContext,
  ChatbotRuntimeContext,
  ChatbotTool,
  ChatbotUser,
  ToolAuthorizationResult,
} from "../types.js";

export type MockRuntimeContextOptions<TServices = unknown> = {
  request?: Request;
  user?: ChatbotUser | null;
  tenant?: { id: string; metadata?: Record<string, unknown> } | null;
  conversationId?: string;
  clientContext?: ChatbotClientContext;
  provider?: string;
  trigger?: string;
  services?: TServices;
};

export type ToolTestOptions<TInput, TServices = unknown> =
  MockRuntimeContextOptions<TServices> & {
    input: TInput;
  };

export type ToolAuthorizationTestResult<TServices = unknown> = {
  context: ChatbotRuntimeContext<TServices>;
  result: ToolAuthorizationResult;
};

export type ToolDeniedTestResult<TServices = unknown> = ToolAuthorizationTestResult<TServices> & {
  reason?: string;
};

export function createMockRuntimeContext<TServices = unknown>(
  options: MockRuntimeContextOptions<TServices> = {},
): ChatbotRuntimeContext<TServices> {
  const context: ChatbotRuntimeContext<TServices> = {
    request: options.request ?? new Request("https://example.test/chat"),
    user: options.user === undefined ? { id: "test_user" } : options.user,
    tenant:
      options.tenant === undefined
        ? options.user?.tenantId
          ? { id: options.user.tenantId }
          : options.user === null
            ? null
            : null
        : options.tenant,
    conversationId: options.conversationId ?? "test_conversation",
    clientContext: options.clientContext ?? {},
    services: (options.services ?? {}) as TServices,
  };

  if (options.provider !== undefined) {
    context.provider = options.provider;
  }
  if (options.trigger !== undefined) {
    context.trigger = options.trigger;
  }

  return context;
}

export const createMockToolContext = createMockRuntimeContext;

export async function runToolTest<TInput, TOutput, TServices = unknown>(
  tool: ChatbotTool<TInput, TOutput, TServices>,
  options: ToolTestOptions<TInput, TServices>,
): Promise<TOutput> {
  const context = createMockRuntimeContext(options);
  const authorization = await authorizeToolForTest(tool, context);
  if (!isAllowed(authorization)) {
    throw new Error(deniedReason(authorization) ?? `Tool "${tool.name}" is not authorized for this test.`);
  }

  return tool.execute({
    input: options.input,
    context,
    options: createMockToolExecutionOptions(tool.name),
    signal: new AbortController().signal,
  });
}

export async function expectToolAuthorized<TInput, TServices = unknown>(
  tool: ChatbotTool<TInput, unknown, TServices>,
  options: MockRuntimeContextOptions<TServices> = {},
): Promise<ToolAuthorizationTestResult<TServices>> {
  const context = createMockRuntimeContext(options);
  const result = await authorizeToolForTest(tool, context);

  if (!isAllowed(result)) {
    throw new Error(deniedReason(result) ?? `Expected tool "${tool.name}" to be authorized.`);
  }

  return { context, result };
}

export async function expectToolDenied<TInput, TServices = unknown>(
  tool: ChatbotTool<TInput, unknown, TServices>,
  options: MockRuntimeContextOptions<TServices> = {},
): Promise<ToolDeniedTestResult<TServices>> {
  const context = createMockRuntimeContext(options);
  const result = await authorizeToolForTest(tool, context);

  if (isAllowed(result)) {
    throw new Error(`Expected tool "${tool.name}" to be denied.`);
  }

  const reason = deniedReason(result);
  const deniedResult: ToolDeniedTestResult<TServices> = {
    context,
    result,
  };
  if (reason) {
    deniedResult.reason = reason;
  }

  return deniedResult;
}

async function authorizeToolForTest<TInput, TServices>(
  tool: ChatbotTool<TInput, unknown, TServices>,
  context: ChatbotRuntimeContext<TServices>,
): Promise<ToolAuthorizationResult> {
  const enabled = typeof tool.enabled === "function" ? await tool.enabled(context) : tool.enabled;
  if (enabled === false) {
    return { allowed: false, reason: `Tool "${tool.name}" is disabled.` };
  }

  if (requiresExplicitApproval(tool) && !hasExplicitApproval(tool, context)) {
    return {
      allowed: false,
      reason: `Tool "${tool.name}" requires explicit human approval.`,
    };
  }

  return tool.authorize
    ? tool.authorize({
        tool,
        context,
      })
    : true;
}

function requiresExplicitApproval<TInput, TServices>(tool: ChatbotTool<TInput, unknown, TServices>) {
  return tool.requiresConfirmation === true || tool.destructive === true || tool.dangerous === true;
}

function hasExplicitApproval<TInput, TServices>(
  tool: ChatbotTool<TInput, unknown, TServices>,
  context: ChatbotRuntimeContext<TServices>,
) {
  const approvedTools = context.clientContext.approvedToolNames;
  return (
    context.clientContext.humanApproved === true ||
    (Array.isArray(approvedTools) && approvedTools.includes(tool.name))
  );
}

function isAllowed(result: ToolAuthorizationResult): boolean {
  return typeof result === "boolean" ? result : result.allowed;
}

function deniedReason(result: ToolAuthorizationResult): string | undefined {
  return typeof result === "boolean" ? undefined : result.reason;
}

function createMockToolExecutionOptions(toolName: string): ToolExecutionOptions {
  return {
    toolCallId: `${toolName}_test_call`,
  } as ToolExecutionOptions;
}
