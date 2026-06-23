import type { LanguageModel, ToolExecutionOptions, UIMessage } from "ai";

export type Awaitable<T> = T | Promise<T>;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ChatbotModel = LanguageModel;

export type ChatbotUser = {
  id: string;
  roles?: string[];
  scopes?: string[];
  tenantId?: string;
  metadata?: Record<string, unknown>;
};

export type ChatbotTenant = {
  id: string;
  metadata?: Record<string, unknown>;
};

export type ChatbotClientContext = Record<string, unknown>;

export type ChatbotRequestBody = {
  messages?: UIMessage[];
  message?: UIMessage;
  conversationId?: string;
  provider?: string;
  trigger?: string;
  context?: ChatbotClientContext;
};

export type ChatbotRuntimeContext<TServices = unknown> = {
  request: Request;
  user: ChatbotUser | null;
  tenant?: ChatbotTenant | null;
  conversationId: string;
  clientContext: ChatbotClientContext;
  provider?: string;
  trigger?: string;
  intent?: ChatIntent;
  route?: IntentRoute;
  runtimeConfig?: ChatbotRuntimeConfig | null;
  toolAvailability?: ToolAvailability[];
  services: TServices;
};

export type ChatbotErrorCode =
  | "auth"
  | "rate_limit"
  | "model"
  | "tool"
  | "output_validation"
  | "timeout"
  | "validation"
  | "network"
  | "unknown";

export type ChatbotErrorBody = {
  error: string;
  code: ChatbotErrorCode;
  retryable: boolean;
};

export type AuthAdapter<TServices = unknown> = {
  authenticate(input: {
    request: Request;
    body: ChatbotRequestBody;
    services: TServices;
  }): Awaitable<ChatbotUser | null>;
};

export type RateLimitAdapter<TServices = unknown> = {
  check(input: {
    request: Request;
    user: ChatbotUser | null;
    body: ChatbotRequestBody;
    services: TServices;
  }): Awaitable<{ allowed: true } | { allowed: false; retryAfter?: number; reason?: string }>;
};

export type ToolExecutionRateLimitAdapter<TServices = unknown> = {
  check(input: {
    tool: ChatbotTool<unknown, unknown, TServices>;
    input: unknown;
    context: ChatbotRuntimeContext<TServices>;
    options: ToolExecutionOptions;
  }): Awaitable<{ allowed: true } | { allowed: false; retryAfter?: number; reason?: string }>;
};

export type UsageEvent = {
  type: "usage.recorded";
  conversation_id: string;
  user_id: string | null;
  tenant: string | null;
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  tool_calls_count: number;
  cost_estimate: number | null;
  created_at: Date;
};

export type UsageCostInput<TServices = unknown> = Omit<
  UsageEvent,
  "type" | "cost_estimate" | "created_at"
> & {
  context: ChatbotRuntimeContext<TServices>;
};

export type UsageAdapter<TServices = unknown> = {
  estimateCost?(input: UsageCostInput<TServices>): Awaitable<number | null | undefined>;
  record(event: UsageEvent): Awaitable<void>;
};

export type UsageBudgetResult = { allowed: true } | { allowed: false; reason?: string; retryAfter?: number };

export type UsageBudgetAdapter<TServices = unknown> = {
  check(input: UsageCostInput<TServices> & { costEstimate: number | null }): Awaitable<UsageBudgetResult>;
};

export type ConversationRecord = {
  id: string;
  userId?: string;
  tenantId?: string;
  title?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
};

export type ConversationRecordWithMessages = ConversationRecord & {
  messages: UIMessage[];
};

export type PersistenceAdapter = {
  getOrCreateConversation(input: {
    conversationId?: string;
    user: ChatbotUser | null;
    context: ChatbotClientContext;
  }): Awaitable<ConversationRecord>;
  loadMessages(input: { conversationId: string; user: ChatbotUser | null }): Awaitable<UIMessage[]>;
  saveMessage(input: {
    conversationId: string;
    user: ChatbotUser | null;
    message: UIMessage;
  }): Awaitable<void>;
  saveMessages?(input: {
    conversationId: string;
    user: ChatbotUser | null;
    messages: UIMessage[];
  }): Awaitable<void>;
  listConversations?(input: {
    user: ChatbotUser | null;
    limit?: number;
  }): Awaitable<ConversationRecord[]>;
  loadConversation?(input: {
    conversationId: string;
    user: ChatbotUser | null;
  }): Awaitable<ConversationRecordWithMessages | null>;
  updateConversation?(input: {
    conversationId: string;
    user: ChatbotUser | null;
    title?: string;
    metadata?: Record<string, unknown>;
  }): Awaitable<ConversationRecord | null>;
  deleteConversation?(input: {
    conversationId: string;
    user: ChatbotUser | null;
  }): Awaitable<void | boolean>;
  searchConversations?(input: {
    user: ChatbotUser | null;
    query: string;
    limit?: number;
  }): Awaitable<ConversationRecord[]>;
};

export type AuditEvent =
  | {
      type: "request.started";
      conversationId?: string;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "request.finished";
      conversationId: string;
      durationMs: number;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "request.failed";
      conversationId?: string;
      error: string;
      durationMs: number;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "model.started";
      conversationId: string;
      provider?: string;
      model?: string;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "model.finished";
      conversationId: string;
      provider?: string;
      model?: string;
      durationMs: number;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "tool.started";
      conversationId: string;
      toolName: string;
      toolCallId?: string;
      input: unknown;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "tool.finished";
      conversationId: string;
      toolName: string;
      toolCallId?: string;
      input: unknown;
      output: unknown;
      outputTruncated?: boolean;
      outputSizeBytes?: number;
      durationMs: number;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "tool.failed";
      conversationId: string;
      toolName: string;
      toolCallId?: string;
      input: unknown;
      error: string;
      durationMs: number;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "model.error";
      conversationId: string;
      provider?: string;
      model?: string;
      error: string;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "permission.denied";
      conversationId?: string;
      scope: "request" | "tool";
      toolName?: string;
      reason: string;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "tool.filtered";
      conversationId: string;
      toolName: string;
      reason: string;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "tool.denied";
      conversationId: string;
      toolName: string;
      toolCallId?: string;
      input: unknown;
      reason: string;
      code?: string;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "tools.resolved";
      conversationId: string;
      step_number?: number;
      intent_detected?: string;
      tools_total: number;
      tools_sent: number;
      tools_unavailable: ToolAvailability[];
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "rate_limit.denied";
      conversationId?: string;
      scope?: "request" | "tool";
      toolName?: string;
      reason?: string;
      retryAfter?: number;
      user: ChatbotUser | null;
      createdAt: Date;
    };

export type AuditAdapter = {
  record(event: AuditEvent): Awaitable<void>;
};

export type ChatbotDebugTraceTool = {
  name: string;
  description: string;
  destructive?: boolean;
  requiresConfirmation?: boolean;
  timeoutMs?: number;
  enabled?: boolean;
};

export type ChatbotDebugTraceMessagePart = {
  type: string;
  redacted?: boolean;
  [key: string]: unknown;
};

export type ChatbotDebugTraceMessage = {
  id?: string;
  role: string;
  parts: ChatbotDebugTraceMessagePart[];
};

export type ChatbotDebugTrace = {
  requestId: string;
  conversationId: string;
  provider?: string;
  model?: string;
  systemPrompt: string | null;
  messages: ChatbotDebugTraceMessage[];
  tools: ChatbotDebugTraceTool[];
  createdAt: Date;
};

export type DebugTraceEvent =
  | {
      type: "request.started";
      conversationId?: string;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "request.finished";
      conversationId: string;
      durationMs: number;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "request.failed";
      conversationId?: string;
      error: string;
      code: ChatbotErrorCode;
      durationMs: number;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "model.started";
      conversationId: string;
      provider?: string;
      model?: string;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "model.finished";
      conversationId: string;
      provider?: string;
      model?: string;
      durationMs: number;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "model.error";
      conversationId: string;
      provider?: string;
      model?: string;
      error: string;
      code: ChatbotErrorCode;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "trace.snapshot";
      conversationId: string;
      trace: ChatbotDebugTrace;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "tool.started";
      conversationId: string;
      toolName: string;
      toolCallId?: string;
      input: unknown;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "tool.finished";
      conversationId: string;
      toolName: string;
      toolCallId?: string;
      input: unknown;
      output: unknown;
      durationMs: number;
      user: ChatbotUser | null;
      createdAt: Date;
    }
  | {
      type: "tool.failed";
      conversationId: string;
      toolName: string;
      toolCallId?: string;
      input: unknown;
      error: string;
      code: ChatbotErrorCode;
      durationMs: number;
      user: ChatbotUser | null;
      createdAt: Date;
    };

export type DebugTraceAdapter = {
  record(event: DebugTraceEvent): Awaitable<void>;
};

export type ToolAuthorizationPhase = "filter" | "execute";

export type ToolAuthorizationResult =
  | boolean
  | {
      allowed: boolean;
      reason?: string;
      code?: string;
      retryable?: boolean;
      metadata?: Record<string, unknown>;
    };

export type ToolPermissionRule =
  | {
      type: "role";
      anyOf?: readonly string[];
      allOf?: readonly string[];
      reason?: string;
    }
  | {
      type: "scope";
      anyOf?: readonly string[];
      allOf?: readonly string[];
      reason?: string;
    }
  | {
      type: "tenant";
      required?: boolean;
      anyOf?: readonly string[];
      reason?: string;
    }
  | {
      type: "featureFlag";
      flag: string;
      reason?: string;
    };

export type ToolAuthorize<TInput = unknown, TServices = unknown> = (input: {
  tool: ChatbotTool<TInput, unknown, TServices>;
  context: ChatbotRuntimeContext<TServices>;
  input?: TInput;
  phase?: ToolAuthorizationPhase;
}) => Awaitable<ToolAuthorizationResult>;

export type ToolPolicyRule<TInput = unknown, TServices = unknown> = {
  name?: string;
  reason?: string;
  code?: string;
  when(input: {
    tool: ChatbotTool<TInput, unknown, TServices>;
    context: ChatbotRuntimeContext<TServices>;
    input: TInput;
  }): Awaitable<boolean>;
};

export type ToolPolicyMatrix<TInput = unknown, TServices = unknown> = {
  roles?: {
    anyOf?: readonly string[];
    allOf?: readonly string[];
    reason?: string;
  };
  scopes?: {
    anyOf?: readonly string[];
    allOf?: readonly string[];
    reason?: string;
  };
  tenants?: {
    required?: boolean;
    anyOf?: readonly string[];
    reason?: string;
  };
  featureFlags?: readonly (
    | string
    | {
        flag: string;
        reason?: string;
      }
  )[];
  predicates?: readonly ToolPolicyRule<TInput, TServices>[];
};

export type ToolInputSchema<TInput = unknown> = unknown;

export type ToolInputNormalizerInput<TServices = unknown> = {
  tool: ChatbotTool<unknown, unknown, TServices>;
  context: ChatbotRuntimeContext<TServices>;
  input: unknown;
};

export type ToolInputNormalizer<TServices = unknown> = (
  input: ToolInputNormalizerInput<TServices>,
) => Awaitable<unknown>;

export type ToolInputValueNormalizer = (value: unknown) => unknown;

export type ToolResult<TData = unknown> = {
  data?: TData;
  rowCount?: number;
  display?: string;
  metadata?: Record<string, unknown>;
  error?: string;
  code?: string;
  retryable?: boolean;
};

export type ChatbotToolExecute<TInput, TOutput, TServices = unknown> = (input: {
  input: TInput;
  context: ChatbotRuntimeContext<TServices>;
  options: ToolExecutionOptions;
  signal: AbortSignal;
}) => Awaitable<TOutput>;

export type ChatbotTool<TInput = unknown, TOutput = unknown, TServices = unknown> = {
  name: string;
  description: string;
  inputSchema: ToolInputSchema<TInput>;
  outputSchema?: unknown;
  maxOutputBytes?: number;
  permissions?: ToolPermissionRule[];
  policy?: ToolPolicyMatrix<TInput, TServices>;
  inputNormalizers?: readonly ToolInputNormalizer<TServices>[];
  destructive?: boolean;
  dangerous?: boolean;
  requiresConfirmation?: boolean;
  timeoutMs?: number;
  enabled?: boolean | ((context: ChatbotRuntimeContext<TServices>) => Awaitable<boolean>);
  metadata?: Record<string, unknown>;
  authorize?: ToolAuthorize<TInput, TServices>;
  execute: ChatbotToolExecute<TInput, TOutput, TServices>;
};

export type ChatIntent = string;

export type IntentRoute = {
  intent: ChatIntent;
  forcedTool?: string;
  requiresTool?: boolean;
  needsClarification?: boolean;
  metadata?: Record<string, unknown>;
};

export type RuntimeToolConfig = {
  name: string;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
};

export type ChatbotRuntimeConfig = {
  tools?: readonly (string | RuntimeToolConfig)[];
  enabledToolNames?: readonly string[];
  disabledToolNames?: readonly string[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export type RuntimeConfigAdapter<TServices = unknown> = {
  get(input: {
    context: ChatbotRuntimeContext<TServices>;
    body: ChatbotRequestBody;
  }): Awaitable<ChatbotRuntimeConfig | null | undefined>;
};

export type IntentDetector<TServices = unknown> = (input: {
  context: ChatbotRuntimeContext<TServices>;
  body: ChatbotRequestBody;
  messages: UIMessage[];
  message?: UIMessage;
  settings: ChatbotRuntimeConfig | null;
  stepNumber?: number;
  stepMessages?: unknown[];
  steps?: unknown[];
  experimentalContext?: unknown;
}) => Awaitable<IntentRoute | ChatIntent | null | undefined>;

export type ToolAvailability = {
  name: string;
  available: boolean;
  reason?: string;
};

export type ToolResolverInput<TServices = unknown> = {
  user: ChatbotUser | null;
  intent?: ChatIntent;
  route?: IntentRoute;
  settings: ChatbotRuntimeConfig | null;
  message?: UIMessage;
  messages: UIMessage[];
  context: ChatbotRuntimeContext<TServices>;
  tools: ChatbotTool<unknown, unknown, TServices>[];
  unavailableTools: ToolAvailability[];
  stepNumber?: number;
  stepMessages?: unknown[];
  steps?: unknown[];
  experimentalContext?: unknown;
};

export type ToolResolverResult<TServices = unknown> =
  | ChatbotTool<unknown, unknown, TServices>[]
  | {
      tools: ChatbotTool<unknown, unknown, TServices>[];
      unavailableTools?: ToolAvailability[];
    };

export type ResolveToolsHook<TServices = unknown> = (
  input: ToolResolverInput<TServices>,
) => Awaitable<ToolResolverResult<TServices> | null | undefined>;

export type SystemPromptPart<TServices = unknown> =
  | string
  | ((context: ChatbotRuntimeContext<TServices>) => Awaitable<string | null | undefined>);

export type SystemPromptDefinition<TServices = unknown> = {
  parts: SystemPromptPart<TServices>[];
};

export type ModelResolver<TServices = unknown> = (input: {
  provider?: string;
  context: ChatbotRuntimeContext<TServices>;
}) => Awaitable<ChatbotModel>;

export type ChatbotHandlerOptions<TServices = unknown> = {
  model?: ChatbotModel | ModelResolver<TServices>;
  models?: Record<string, ChatbotModel>;
  defaultProvider?: string;
  fallbackProvider?: string;
  fallbackModel?: ChatbotModel;
  requireAuth?: boolean;
  systemPrompt?: SystemPromptDefinition<TServices> | SystemPromptPart<TServices> | SystemPromptPart<TServices>[];
  tools?: ChatbotTool<unknown, unknown, TServices>[];
  detectIntent?: IntentDetector<TServices>;
  toolsByIntent?: Record<string, readonly string[]>;
  resolveTools?: ResolveToolsHook<TServices>;
  runtimeConfigAdapter?: RuntimeConfigAdapter<TServices>;
  services?: TServices;
  authAdapter?: AuthAdapter<TServices>;
  persistence?: PersistenceAdapter;
  auditAdapter?: AuditAdapter;
  debugAdapter?: DebugTraceAdapter;
  usageAdapter?: UsageAdapter<TServices>;
  usageBudgetAdapter?: UsageBudgetAdapter<TServices>;
  rateLimitAdapter?: RateLimitAdapter<TServices>;
  toolExecutionRateLimitAdapter?: ToolExecutionRateLimitAdapter<TServices>;
  toolInputNormalizers?: readonly ToolInputNormalizer<TServices>[];
  defaultToolTimeoutMs?: number;
  maxToolOutputBytes?: number;
  maxSteps?: number;
  maxRequestBytes?: number;
  maxHistoryMessages?: number;
  headers?: HeadersInit;
  onError?: (error: unknown) => string;
};

export type ChatbotHandler = (request: Request) => Promise<Response>;
