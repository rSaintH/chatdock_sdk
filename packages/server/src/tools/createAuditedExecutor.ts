import type {
  AuditAdapter,
  ChatbotRuntimeContext,
  ChatbotTool,
  DebugTraceAdapter,
} from "../types.js";
import { toolOk } from "./toolResult.js";

export function createAuditedExecutor<TServices = unknown>(input: {
  auditAdapter: AuditAdapter;
  debugAdapter?: DebugTraceAdapter;
  context: ChatbotRuntimeContext<TServices>;
  defaultToolTimeoutMs?: number;
  maxToolOutputBytes?: number;
}) {
  return async function executeWithAudit<TInput, TOutput>(
    chatbotTool: ChatbotTool<TInput, TOutput, TServices>,
    toolInput: TInput,
    options: Parameters<ChatbotTool<TInput, TOutput, TServices>["execute"]>[0]["options"],
  ): Promise<TOutput> {
    const startedAt = Date.now();
    const toolCallId = options.toolCallId;
    const timeoutMs = chatbotTool.timeoutMs ?? input.defaultToolTimeoutMs;

    await input.auditAdapter.record({
      type: "tool.started",
      conversationId: input.context.conversationId,
      toolName: chatbotTool.name,
      toolCallId,
      input: toolInput,
      user: input.context.user,
      createdAt: new Date(),
    });
    await recordDebugEvent(input.debugAdapter, {
      type: "tool.started",
      conversationId: input.context.conversationId,
      toolName: chatbotTool.name,
      toolCallId,
      input: toolInput,
      user: input.context.user,
      createdAt: new Date(),
    });

    try {
      const abortState = createToolAbortState({
        toolName: chatbotTool.name,
        timeoutMs,
        requestSignal: input.context.request.signal,
        optionsSignal: getOptionsSignal(options),
      });

      let output: TOutput;
      const abortPromise = createAbortPromise<TOutput>(abortState.signal);
      try {
        throwIfAborted(abortState.signal);
        const rawOutput = await Promise.race([
          chatbotTool.execute({
            input: toolInput,
            context: input.context,
            options,
            signal: abortState.signal,
          }),
          abortPromise.promise,
        ]);
        output = hardenToolOutput({
          tool: chatbotTool,
          output: rawOutput,
          ...(input.maxToolOutputBytes == null ? {} : { maxToolOutputBytes: input.maxToolOutputBytes }),
        }).output;
      } finally {
        abortPromise.cleanup();
        abortState.cleanup();
      }

      const outputMeta = getToolOutputMetadata(output);
      await input.auditAdapter.record({
        type: "tool.finished",
        conversationId: input.context.conversationId,
        toolName: chatbotTool.name,
        toolCallId,
        input: toolInput,
        output,
        ...(outputMeta.outputTruncated ? { outputTruncated: outputMeta.outputTruncated } : {}),
        ...(outputMeta.outputSizeBytes == null ? {} : { outputSizeBytes: outputMeta.outputSizeBytes }),
        durationMs: Date.now() - startedAt,
        user: input.context.user,
        createdAt: new Date(),
      });
      await recordDebugEvent(input.debugAdapter, {
        type: "tool.finished",
        conversationId: input.context.conversationId,
        toolName: chatbotTool.name,
        toolCallId,
        input: toolInput,
        output,
        ...(outputMeta.outputTruncated ? { outputTruncated: outputMeta.outputTruncated } : {}),
        ...(outputMeta.outputSizeBytes == null ? {} : { outputSizeBytes: outputMeta.outputSizeBytes }),
        durationMs: Date.now() - startedAt,
        user: input.context.user,
        createdAt: new Date(),
      });

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await input.auditAdapter.record({
        type: "tool.failed",
        conversationId: input.context.conversationId,
        toolName: chatbotTool.name,
        toolCallId,
        input: toolInput,
        error: message,
        durationMs: Date.now() - startedAt,
        user: input.context.user,
        createdAt: new Date(),
      });
      await recordDebugEvent(input.debugAdapter, {
        type: "tool.failed",
        conversationId: input.context.conversationId,
        toolName: chatbotTool.name,
        toolCallId,
        input: toolInput,
        error: message,
        code: classifyError(error),
        durationMs: Date.now() - startedAt,
        user: input.context.user,
        createdAt: new Date(),
      });

      throw error;
    }
  };
}

function hardenToolOutput<TInput, TOutput, TServices>(input: {
  tool: ChatbotTool<TInput, TOutput, TServices>;
  output: TOutput;
  maxToolOutputBytes?: number;
}): {
  output: TOutput;
} {
  const normalized = normalizeToolOutput(input.output);
  const validationTarget = normalized.error ? undefined : normalized.data;

  const validationError = validateToolOutputSchema(input.tool.outputSchema, validationTarget);
  if (validationError) {
    throw new ToolOutputValidationError(input.tool.name, validationError);
  }

  const maxBytes = normalizePositiveInteger(input.tool.maxOutputBytes ?? input.maxToolOutputBytes);
  if (maxBytes == null || validationTarget == null) {
    return { output: input.output };
  }

  const outputSizeBytes = byteLengthUtf8(safeJsonStringify(validationTarget));
  if (outputSizeBytes <= maxBytes) {
    return { output: input.output };
  }

  const summary = summarizeToolOutput(validationTarget, maxBytes);
  if (isToolResultLike(input.output)) {
    return {
      output: {
        ...normalized,
        data: summary,
        metadata: {
          ...(normalized.metadata ?? {}),
          outputTruncated: true,
          outputSizeBytes,
          outputTruncatedToBytes: maxBytes,
        },
      } as TOutput,
    };
  }

  return {
    output: toolOk({
      data: summary,
      metadata: {
        outputTruncated: true,
        outputSizeBytes,
        outputTruncatedToBytes: maxBytes,
      },
    }) as unknown as TOutput,
  };
}

function getToolOutputMetadata(output: unknown): { outputTruncated?: boolean; outputSizeBytes?: number } {
  if (!isToolResultLike(output)) {
    return {};
  }

  const metadata = output.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  const result: { outputTruncated?: boolean; outputSizeBytes?: number } = {};
  if (typeof metadata.outputTruncated === "boolean") {
    result.outputTruncated = metadata.outputTruncated;
  }
  if (typeof metadata.outputSizeBytes === "number") {
    result.outputSizeBytes = metadata.outputSizeBytes;
  }
  return result;
}

function normalizeToolOutput<TOutput>(output: TOutput): {
  data?: unknown;
  error?: string;
  code?: string;
  retryable?: boolean;
  rowCount?: number;
  display?: string;
  metadata?: Record<string, unknown>;
} {
  if (!isToolResultLike(output)) {
    return { data: output };
  }

  return output;
}

function isToolResultLike(value: unknown): value is {
  data?: unknown;
  error?: string;
  code?: string;
  retryable?: boolean;
  rowCount?: number;
  display?: string;
  metadata?: Record<string, unknown>;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return ["data", "error", "code", "retryable", "rowCount", "display", "metadata"].some((key) => key in value);
}

function validateToolOutputSchema(schema: unknown, value: unknown): string | null {
  if (schema == null || value === undefined) {
    return null;
  }

  if (isSchemaWithSafeParse(schema)) {
    const result = schema.safeParse(value);
    return result.success ? null : result.error?.message ?? "Tool output validation failed.";
  }

  if (isSchemaWithParse(schema)) {
    try {
      schema.parse(value);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Tool output validation failed.";
    }
  }

  if (isJsonSchemaLike(schema)) {
    return validateJsonSchemaLike(schema, value);
  }

  return null;
}

function isSchemaWithSafeParse(schema: unknown): schema is { safeParse(value: unknown): { success: boolean; error?: { message?: string } } } {
  return schema != null && typeof schema === "object" && "safeParse" in schema && typeof (schema as { safeParse?: unknown }).safeParse === "function";
}

function isSchemaWithParse(schema: unknown): schema is { parse(value: unknown): unknown } {
  return schema != null && typeof schema === "object" && "parse" in schema && typeof (schema as { parse?: unknown }).parse === "function";
}

function isJsonSchemaLike(schema: unknown): schema is Record<string, unknown> {
  return Boolean(schema) && typeof schema === "object" && !Array.isArray(schema);
}

function validateJsonSchemaLike(schema: Record<string, unknown>, value: unknown): string | null {
  const type = schema.type;
  if (typeof type === "string") {
    const allowedTypes = type.split("|").map((item) => item.trim());
    const matches = allowedTypes.some((candidate) => matchesJsonType(candidate, value));
    if (!matches) {
      return `Tool output must be of type ${type}.`;
    }
  }

  if (schema.const !== undefined && !Object.is(schema.const, value)) {
    return "Tool output must match the declared constant value.";
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    return "Tool output must match one of the allowed values.";
  }

  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const required = Array.isArray(schema.required)
      ? schema.required.filter((entry): entry is string => typeof entry === "string")
      : [];
    for (const key of required) {
      if (!(key in record)) {
        return `Tool output is missing required property "${key}".`;
      }
    }

    const properties =
      schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
        ? (schema.properties as Record<string, unknown>)
        : undefined;

    if (properties) {
      for (const [key, propertySchema] of Object.entries(properties)) {
        if (key in record) {
          const nestedError = validateJsonSchemaLike(asJsonSchemaRecord(propertySchema), record[key]);
          if (nestedError) {
            return `Tool output property "${key}" is invalid: ${nestedError}`;
          }
        }
      }
    }
  }

  if (schema.type === "array" && Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      return `Tool output must contain at least ${schema.minItems} items.`;
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      return `Tool output must contain at most ${schema.maxItems} items.`;
    }

    if (schema.items != null && typeof schema.items === "object" && !Array.isArray(schema.items)) {
      for (const [index, item] of value.entries()) {
        const nestedError = validateJsonSchemaLike(asJsonSchemaRecord(schema.items), item);
        if (nestedError) {
          return `Tool output item ${index} is invalid: ${nestedError}`;
        }
      }
    }
  }

  if (schema.type === "string" && typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      return `Tool output must be at least ${schema.minLength} characters long.`;
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      return `Tool output must be at most ${schema.maxLength} characters long.`;
    }
  }

  return null;
}

function matchesJsonType(type: string, value: unknown): boolean {
  switch (type) {
    case "object":
      return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return true;
  }
}

function asJsonSchemaRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function summarizeToolOutput(value: unknown, maxBytes: number): unknown {
  if (typeof value === "string") {
    return truncateString(value, maxBytes);
  }

  const preview = safeJsonStringify(value);
  return byteLengthUtf8(preview) <= maxBytes ? preview : truncateString(preview, maxBytes);
}

function truncateString(value: string, maxBytes: number): string {
  if (byteLengthUtf8(value) <= maxBytes) {
    return value;
  }

  const buffer = new TextEncoder().encode(value).slice(0, Math.max(0, maxBytes - 1));
  return `${new TextDecoder().decode(buffer)}…`;
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function byteLengthUtf8(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function normalizePositiveInteger(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : undefined;
}

class ToolOutputValidationError extends Error {
  constructor(toolName: string, reason: string) {
    super(`Tool "${toolName}" returned invalid output: ${reason}`);
    this.name = "ToolOutputValidationError";
  }
}

async function recordDebugEvent(debugAdapter: DebugTraceAdapter | undefined, event: Parameters<DebugTraceAdapter["record"]>[0]) {
  if (!debugAdapter) return;

  try {
    await debugAdapter.record(event);
  } catch {
    // Debug observers must not affect tool execution.
  }
}

function classifyError(error: unknown) {
  if (error instanceof ToolOutputValidationError) {
    return "output_validation";
  }
  if (error instanceof ToolTimeoutError || (error instanceof Error && /timeout/i.test(error.message))) {
    return "timeout";
  }

  return "unknown";
}

class ToolTimeoutError extends Error {
  constructor(toolName: string, timeoutMs: number) {
    super(`Tool "${toolName}" timed out after ${timeoutMs}ms.`);
    this.name = "ToolTimeoutError";
  }
}

class ToolAbortedError extends Error {
  constructor(toolName: string) {
    super(`Tool "${toolName}" was aborted before it finished.`);
    this.name = "ToolAbortedError";
  }
}

function createToolAbortState(input: {
  toolName: string;
  timeoutMs: number | undefined;
  requestSignal: AbortSignal;
  optionsSignal: AbortSignal | undefined;
}): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const cleanupCallbacks: (() => void)[] = [];

  const abort = (reason: unknown) => {
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  };

  for (const signal of [input.requestSignal, input.optionsSignal]) {
    if (!signal) continue;
    if (signal.aborted) {
      abort(signal.reason ?? new ToolAbortedError(input.toolName));
      continue;
    }

    const onAbort = () => abort(signal.reason ?? new ToolAbortedError(input.toolName));
    signal.addEventListener("abort", onAbort, { once: true });
    cleanupCallbacks.push(() => signal.removeEventListener("abort", onAbort));
  }

  if (isPositiveTimeout(input.timeoutMs)) {
    const timeoutMs = input.timeoutMs;
    const timeout = setTimeout(() => {
      abort(new ToolTimeoutError(input.toolName, timeoutMs));
    }, timeoutMs);
    cleanupCallbacks.push(() => clearTimeout(timeout));
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      for (const cleanup of cleanupCallbacks) {
        cleanup();
      }
    },
  };
}

function createAbortPromise<TOutput>(signal: AbortSignal): {
  promise: Promise<TOutput>;
  cleanup: () => void;
} {
  let cleanup: () => void = () => undefined;
  const promise = new Promise<TOutput>((_, reject) => {
    if (signal.aborted) {
      reject(getAbortReason(signal));
      return;
    }

    const onAbort = () => {
      cleanup();
      reject(getAbortReason(signal));
    };
    cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
  });

  return { promise, cleanup };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw getAbortReason(signal);
  }
}

function getAbortReason(signal: AbortSignal): unknown {
  return signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason ?? "Aborted"));
}

function getOptionsSignal(options: unknown): AbortSignal | undefined {
  if (!options || typeof options !== "object") return undefined;

  const maybeOptions = options as { abortSignal?: unknown; signal?: unknown };
  if (isAbortSignal(maybeOptions.abortSignal)) return maybeOptions.abortSignal;
  if (isAbortSignal(maybeOptions.signal)) return maybeOptions.signal;
  return undefined;
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return (
    typeof value === "object" &&
    value !== null &&
    "aborted" in value &&
    "addEventListener" in value &&
    "removeEventListener" in value
  );
}

function isPositiveTimeout(timeoutMs: number | undefined): timeoutMs is number {
  return typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0;
}
