import type { UsageBudgetAdapter, UsageCostInput, UsageBudgetResult } from "./types.js";
import { estimateModelCost } from "./tools/createToolExecutionRateLimit.js";

export type InMemoryUsageBudgetOptions<TServices = unknown> = {
  maxCostPerTenant?: number;
  maxCostPerUser?: number;
  now?: () => Date;
  key?: (input: UsageCostInput<TServices> & { costEstimate: number | null }) => string;
};

export function createInMemoryUsageBudget<TServices = unknown>(
  options: InMemoryUsageBudgetOptions<TServices> = {},
): UsageBudgetAdapter<TServices> & { totals: Map<string, number> } {
  const totals = new Map<string, number>();

  return {
    totals,
    async check(input) {
      const key =
        options.key?.(input) ??
        budgetKey({
          tenantId: input.context.tenant?.id ?? input.context.user?.tenantId ?? "anonymous",
          userId: input.context.user?.id ?? null,
        });

      const current = totals.get(key) ?? 0;
      const next = current + (input.costEstimate ?? 0);
      const limit = input.context.user?.tenantId ? options.maxCostPerTenant : options.maxCostPerUser;

      if (limit == null || limit <= 0) {
        totals.set(key, next);
        return { allowed: true };
      }

      if (next > limit) {
        return {
          allowed: false,
          reason: `Usage budget exceeded for ${input.context.user?.tenantId ? "tenant" : "user"}.`,
        };
      }

      totals.set(key, next);
      return { allowed: true };
    },
  };
}

export function estimateUsageCost(input: {
  inputTokens?: number | null;
  outputTokens?: number | null;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}): number | null {
  return estimateModelCost(input);
}

function budgetKey(input: { tenantId: string; userId: string | null }): string {
  return `${input.tenantId}:${input.userId ?? "anonymous"}`;
}

export type { UsageBudgetResult };
