import { describe, expect, it } from "vitest";
import { createInMemoryDebugTraceAdapter } from "./createInMemoryDebugTraceAdapter.js";

describe("createInMemoryDebugTraceAdapter", () => {
  it("stores events and snapshots in memory", async () => {
    const adapter = createInMemoryDebugTraceAdapter();
    await adapter.record({
      type: "trace.snapshot",
      conversationId: "conv_1",
      trace: {
        requestId: "req_1",
        conversationId: "conv_1",
        systemPrompt: null,
        messages: [],
        tools: [],
        createdAt: new Date("2026-06-22T00:00:00.000Z"),
      },
      user: null,
      createdAt: new Date("2026-06-22T00:00:00.000Z"),
    });

    expect(adapter.events).toHaveLength(1);
    expect(adapter.traces).toHaveLength(1);
    expect(adapter.traces[0]?.conversationId).toBe("conv_1");

    adapter.clear();
    expect(adapter.events).toHaveLength(0);
    expect(adapter.traces).toHaveLength(0);
  });
});
