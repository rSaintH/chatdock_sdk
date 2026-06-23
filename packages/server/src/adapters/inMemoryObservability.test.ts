import { describe, expect, it } from "vitest";
import {
  createInMemoryAuditAdapter,
  createInMemoryUsageAdapter,
} from "./inMemoryObservability.js";

describe("inMemoryObservability", () => {
  it("stores and filters audit events", async () => {
    const audit = createInMemoryAuditAdapter();

    await audit.record({
      type: "tool.started",
      conversationId: "conv_1",
      toolName: "search_clients",
      input: { q: "abc" },
      user: { id: "user_1" },
      createdAt: new Date("2026-06-22T10:00:00.000Z"),
    });
    await audit.record({
      type: "request.started",
      conversationId: "conv_2",
      user: null,
      createdAt: new Date("2026-06-22T10:01:00.000Z"),
    });

    expect(audit.list({ conversationId: "conv_1" })).toHaveLength(1);
    expect(audit.list({ userId: "user_1" })).toHaveLength(1);
    expect(audit.list({ type: ["request.started", "tool.started"] })).toHaveLength(2);
  });

  it("stores and filters usage events", async () => {
    const usage = createInMemoryUsageAdapter();

    await usage.record({
      type: "usage.recorded",
      conversation_id: "conv_1",
      user_id: "user_1",
      tenant: "tenant_1",
      provider: "openai",
      model: "gpt-4o-mini",
      input_tokens: 10,
      output_tokens: 20,
      tool_calls_count: 1,
      cost_estimate: 0.001,
      created_at: new Date("2026-06-22T10:00:00.000Z"),
    });

    expect(usage.list({ conversationId: "conv_1" })).toHaveLength(1);
    expect(usage.list({ tenant: "tenant_1" })).toHaveLength(1);
    expect(usage.list({ provider: "openai" })).toHaveLength(1);
  });
});
