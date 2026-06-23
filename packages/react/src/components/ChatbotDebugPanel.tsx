import { forwardRef } from "react";
import type { ChatbotDebugPanelProps, ChatbotDebugTraceEvent } from "../types";

function formatValue(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getSnapshot(events: ChatbotDebugTraceEvent[] | undefined, trace: ChatbotDebugPanelProps["trace"]) {
  if (trace) return trace;
  return events?.slice().reverse().find((event) => event.type === "trace.snapshot")?.trace;
}

export const ChatbotDebugPanel = forwardRef<HTMLDivElement, ChatbotDebugPanelProps>(
  ({ className, trace, events, emptyLabel = "No debug trace available yet.", ...props }, ref) => {
    const snapshot = getSnapshot(events, trace);
    const visibleEvents = events ?? [];

    return (
      <div
        {...props}
        ref={ref}
        className={["cb-sdk-debug", className].filter(Boolean).join(" ")}
        aria-label="Debug trace"
      >
        {!snapshot ? (
          <div className="cb-sdk-debug__empty">{emptyLabel}</div>
        ) : (
          <>
            <header className="cb-sdk-debug__header">
              <div>
                <h3 className="cb-sdk-debug__title">Debug trace</h3>
                <p className="cb-sdk-debug__subtitle">
                  {snapshot.conversationId}
                  {snapshot.requestId ? ` · ${snapshot.requestId}` : ""}
                </p>
              </div>
              <div className="cb-sdk-debug__meta">
                <span>{snapshot.provider ?? "default provider"}</span>
                <span>{snapshot.model ?? "default model"}</span>
              </div>
            </header>

            <div className="cb-sdk-debug__grid">
              <article className="cb-sdk-debug__panel">
                <h4>System prompt</h4>
                <pre className="cb-sdk-debug__code">{formatValue(snapshot.systemPrompt) ?? "None"}</pre>
              </article>

              <article className="cb-sdk-debug__panel">
                <h4>Messages</h4>
                <div className="cb-sdk-debug__stack">
                  {snapshot.messages.map((message, index) => (
                    <section className="cb-sdk-debug__item" key={`${message.id ?? index}`}>
                      <div className="cb-sdk-debug__itemTitle">
                        <span>{message.role}</span>
                        {message.id ? <code>{message.id}</code> : null}
                      </div>
                      <div className="cb-sdk-debug__parts">
                        {message.parts.map((part, partIndex) => (
                          <pre className="cb-sdk-debug__code" key={`${message.id ?? index}-${partIndex}`}>
                            {formatValue(part) ?? "Empty"}
                          </pre>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </article>

              <article className="cb-sdk-debug__panel">
                <h4>Tools</h4>
                <div className="cb-sdk-debug__stack">
                  {snapshot.tools.map((tool) => (
                    <section className="cb-sdk-debug__item" key={tool.name}>
                      <div className="cb-sdk-debug__itemTitle">
                        <span>{tool.name}</span>
                        {tool.requiresConfirmation ? <code>approval</code> : null}
                        {tool.destructive ? <code>destructive</code> : null}
                      </div>
                      <p className="cb-sdk-debug__description">{tool.description}</p>
                    </section>
                  ))}
                </div>
              </article>
            </div>

            <article className="cb-sdk-debug__panel cb-sdk-debug__panel--events">
              <h4>Events</h4>
              <div className="cb-sdk-debug__stack">
                {visibleEvents.map((event, index) => (
                  <section className="cb-sdk-debug__item" key={`${event.type}-${index}`}>
                    <div className="cb-sdk-debug__itemTitle">
                      <span>{event.type}</span>
                      {"durationMs" in event ? <code>{`${event.durationMs}ms`}</code> : null}
                    </div>
                    <pre className="cb-sdk-debug__code">{formatValue(event) ?? "Empty"}</pre>
                  </section>
                ))}
              </div>
            </article>
          </>
        )}
      </div>
    );
  },
);

ChatbotDebugPanel.displayName = "ChatbotDebugPanel";
