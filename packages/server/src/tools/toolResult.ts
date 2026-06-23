import type { ToolResult } from "../types.js";

export function toolOk<TData>(
  input: TData | Omit<ToolResult<TData>, "error" | "code" | "retryable">,
): ToolResult<TData> {
  if (isToolResultInput(input)) {
    return input;
  }

  return { data: input };
}

export function toolError(input: {
  message: string;
  code?: string;
  retryable?: boolean;
  metadata?: Record<string, unknown>;
}): ToolResult<never> {
  return {
    error: input.message,
    ...(input.code ? { code: input.code } : {}),
    retryable: input.retryable ?? false,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

export function toolDenied(input: {
  message: string;
  code?: string;
  retryable?: boolean;
  metadata?: Record<string, unknown>;
}): ToolResult<never> {
  return toolError({
    message: input.message,
    code: input.code ?? "tool_denied",
    retryable: input.retryable ?? false,
    metadata: {
      denied: true,
      ...(input.metadata ?? {}),
    },
  });
}

function isToolResultInput<TData>(
  value: TData | Omit<ToolResult<TData>, "error" | "code" | "retryable">,
): value is Omit<ToolResult<TData>, "error" | "code" | "retryable"> {
  return (
    value != null &&
    typeof value === "object" &&
    ("data" in value || "rowCount" in value || "display" in value || "metadata" in value)
  );
}
