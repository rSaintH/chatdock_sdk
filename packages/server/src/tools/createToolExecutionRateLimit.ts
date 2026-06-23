import type { ChatbotRuntimeContext, ChatbotTool, ToolExecutionRateLimitAdapter } from "../types.js";

export type InMemoryToolExecutionRateLimitOptions<TServices = unknown> = {
  destructivePerUserPerDay?: number;
  perUserPerDay?: number;
  now?: () => Date;
  key?: (input: {
    tool: ChatbotTool<unknown, unknown, TServices>;
    context: ChatbotRuntimeContext<TServices>;
  }) => string;
};

export function createInMemoryToolExecutionRateLimit<TServices = unknown>(
  options: InMemoryToolExecutionRateLimitOptions<TServices> = {},
): ToolExecutionRateLimitAdapter<TServices> & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  const now = options.now ?? (() => new Date());

  return {
    counts,
    check(input) {
      const limit = input.tool.destructive
        ? options.destructivePerUserPerDay
        : options.perUserPerDay;

      if (limit == null || limit < 1) {
        return { allowed: true };
      }

      const day = utcDay(now());
      const key =
        options.key?.({ tool: input.tool, context: input.context }) ??
        `${day}:${input.context.user?.id ?? "anonymous"}:${input.tool.destructive ? "destructive" : input.tool.name}`;
      const current = counts.get(key) ?? 0;

      if (current >= limit) {
        return {
          allowed: false,
          reason: input.tool.destructive
            ? "Daily destructive tool limit exceeded."
            : `Daily tool limit exceeded for "${input.tool.name}".`,
          retryAfter: secondsUntilNextUtcDay(now()),
        };
      }

      counts.set(key, current + 1);
      return { allowed: true };
    },
  };
}

export function estimateModelCost(input: {
  inputTokens?: number | null;
  outputTokens?: number | null;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}): number | null {
  const inputTokens = normalizedTokenCount(input.inputTokens);
  const outputTokens = normalizedTokenCount(input.outputTokens);

  if (inputTokens == null && outputTokens == null) {
    return null;
  }

  return (
    ((inputTokens ?? 0) / 1_000_000) * input.inputCostPerMillion +
    ((outputTokens ?? 0) / 1_000_000) * input.outputCostPerMillion
  );
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function secondsUntilNextUtcDay(date: Date): number {
  const nextDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  return Math.max(1, Math.ceil((nextDay - date.getTime()) / 1000));
}

function normalizedTokenCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
