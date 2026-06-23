import type { ChatbotDebugTrace, DebugTraceAdapter, DebugTraceEvent } from "../types.js";

export type InMemoryDebugTraceAdapter = DebugTraceAdapter & {
  events: DebugTraceEvent[];
  traces: ChatbotDebugTrace[];
  clear(): void;
};

export function createInMemoryDebugTraceAdapter(initialEvents: DebugTraceEvent[] = []): InMemoryDebugTraceAdapter {
  const events: DebugTraceEvent[] = [...initialEvents];
  const traces: ChatbotDebugTrace[] = [];

  return {
    events,
    traces,
    clear() {
      events.length = 0;
      traces.length = 0;
    },
    async record(event) {
      events.push(event);
      if (event.type === "trace.snapshot") {
        traces.push(event.trace);
      }
    },
  };
}
