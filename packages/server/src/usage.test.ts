import { describe, expect, it } from "vitest";
import { createInMemoryUsageBudget, estimateUsageCost } from "./usage.js";

describe("usage helpers", () => {
  it("estimates usage cost with the shared helper", () => {
    expect(
      estimateUsageCost({
        inputTokens: 1_000,
        outputTokens: 2_000,
        inputCostPerMillion: 1,
        outputCostPerMillion: 2,
      }),
    ).toBe(0.005);
  });

  it("tracks budget by tenant or user in memory", async () => {
    const budget = createInMemoryUsageBudget({
      maxCostPerTenant: 0.01,
    });

    await expect(
      budget.check({
        context: {
          request: new Request("https://example.com"),
          user: { id: "user_1", tenantId: "tenant_1" },
          tenant: { id: "tenant_1" },
          conversationId: "conv_1",
          clientContext: {},
          services: {},
        },
        modelInfo: { provider: "openai", model: "gpt-4o-mini" },
        usage: { inputTokens: 1000, outputTokens: 1000 },
        toolCallsCount: 0,
        costEstimate: 0.004,
      }),
    ).resolves.toEqual({ allowed: true });

    await expect(
      budget.check({
        context: {
          request: new Request("https://example.com"),
          user: { id: "user_1", tenantId: "tenant_1" },
          tenant: { id: "tenant_1" },
          conversationId: "conv_1",
          clientContext: {},
          services: {},
        },
        modelInfo: { provider: "openai", model: "gpt-4o-mini" },
        usage: { inputTokens: 1000, outputTokens: 1000 },
        toolCallsCount: 0,
        costEstimate: 0.01,
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: "Usage budget exceeded for tenant.",
    });
  });
});
