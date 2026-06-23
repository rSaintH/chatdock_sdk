import type { ChatbotDebugTrace, ChatbotDebugTraceMessage, ChatbotDebugTraceTool } from "../types.js";

const sensitiveKeys = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "secret",
  "service_role",
  "servicerole",
  "token",
  "api_key",
  "apikey",
  "x-api-key",
]);

export function redactDebugTrace(trace: ChatbotDebugTrace): ChatbotDebugTrace {
  return {
    ...trace,
    systemPrompt: redactDebugText(trace.systemPrompt),
    messages: trace.messages.map((message) => redactDebugMessage(message)),
    tools: trace.tools.map((tool) => redactDebugTool(tool)),
  };
}

export function redactDebugText(value: string | null | undefined): string | null {
  if (value == null) return null;

  return redactDebugString(value);
}

function redactDebugMessage(message: ChatbotDebugTraceMessage): ChatbotDebugTraceMessage {
  return {
    ...message,
    parts: message.parts.map((part) => redactDebugValue(part) as ChatbotDebugTraceMessage["parts"][number]),
  };
}

function redactDebugTool(tool: ChatbotDebugTraceTool): ChatbotDebugTraceTool {
  return {
    ...tool,
    description: redactDebugString(tool.description),
  };
}

function redactDebugValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactDebugString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactDebugValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => {
      if (sensitiveKeys.has(key.toLowerCase())) {
        return [key, "[redacted]"];
      }

      return [key, redactDebugValue(entry)];
    }),
  );
}

function redactDebugString(value: string): string {
  let output = value;
  output = output.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
  output = output.replace(/(?:sk|pk|rk|sb)_[A-Za-z0-9_-]{8,}/gi, "[redacted]");
  output = output.replace(/(api[_-]?key[:=]\s*)([^\s'"]+)/gi, "$1[redacted]");
  output = output.replace(/(secret[:=]\s*)([^\s'"]+)/gi, "$1[redacted]");
  output = output.replace(/(password[:=]\s*)([^\s'"]+)/gi, "$1[redacted]");
  return output;
}
