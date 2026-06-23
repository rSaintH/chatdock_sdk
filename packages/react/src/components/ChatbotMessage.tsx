import { useState } from "react";
import { useChatbot } from "../context";
import type { ChatbotMessageProps } from "../types";

function stringifyValue(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getPartText(part: Record<string, unknown>) {
  return (
    stringifyValue(part.text) ??
    stringifyValue(part.errorText) ??
    stringifyValue(part.output) ??
    stringifyValue(part.input)
  );
}

function getToolName(type: string) {
  return type.startsWith("tool-") ? type.slice("tool-".length) : undefined;
}

function isApprovalRequired(errorText: string | null) {
  if (!errorText) return false;
  const normalized = errorText.toLowerCase();
  return (
    normalized.includes("explicit human approval") ||
    normalized.includes("explicit confirmation") ||
    normalized.includes("requires confirmation") ||
    normalized.includes("approval required")
  );
}

export function ChatbotMessage({
  message,
  labels,
  renderPart,
  className,
  ...props
}: ChatbotMessageProps) {
  const chatbot = useChatbot();
  const [approvalDismissed, setApprovalDismissed] = useState(false);

  return (
    <article
      {...props}
      className={["cb-sdk-message", `cb-sdk-message--${message.role}`, className].filter(Boolean).join(" ")}
      data-role={message.role}
    >
      <div className="cb-sdk-message__meta">
        {message.role === "user" ? labels.userLabel : labels.assistantLabel}
      </div>
      <div className="cb-sdk-message__body">
        {message.parts.map((part, index) => {
          if (renderPart) {
            return <div key={`${message.id}-${index}`}>{renderPart(part, message, index)}</div>;
          }

          if (!isRecord(part) || typeof part.type !== "string") {
            return null;
          }

          const partRecord = part as Record<string, unknown>;
          const toolName = getToolName(part.type);

          if (part.type === "text") {
            return (
              <p className="cb-sdk-message__text" key={`${message.id}-${index}`}>
                {stringifyValue(part.text)}
              </p>
            );
          }

          if (toolName) {
            const state = stringifyValue(partRecord.state);
            const errorText = stringifyValue(partRecord.errorText);
            const value = getPartText(partRecord);
            const approvalRequired = !approvalDismissed && state === "output-error" && isApprovalRequired(errorText);
            const isError = state === "output-error" || Boolean(partRecord.errorText);

            return (
              <div
                className={`cb-sdk-tool ${isError ? "cb-sdk-tool--error" : ""}`}
                key={`${message.id}-${index}`}
              >
                <div className="cb-sdk-tool__title">
                  <span>{labels.toolLabel}</span>
                  <code>{toolName}</code>
                  {state ? <span className="cb-sdk-tool__state">{state}</span> : null}
                </div>
                {value ? <pre className="cb-sdk-tool__value">{value}</pre> : null}
                {approvalRequired ? (
                  <div className="cb-sdk-tool__approval">
                    <strong>{labels.approvalTitle}</strong>
                    <p>{labels.approvalDescription}</p>
                    <div className="cb-sdk-tool__approvalActions">
                      <button
                        type="button"
                        className="cb-sdk-tool__approvalButton"
                        onClick={() => {
                          setApprovalDismissed(true);
                          void chatbot.approveTool(toolName, labels.approvalConfirm);
                        }}
                      >
                        {labels.approvalConfirm}
                      </button>
                      <button
                        type="button"
                        className="cb-sdk-tool__approvalCancelButton"
                        onClick={() => {
                          chatbot.setTrigger("approval");
                          void Promise.resolve(chatbot.chat.sendMessage({ text: labels.approvalCancel })).finally(() => {
                            chatbot.setTrigger(undefined);
                          });
                          setApprovalDismissed(true);
                        }}
                      >
                        {labels.approvalCancel}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          }

          const value = getPartText(partRecord);
          if (!value) return null;

          return (
            <pre className="cb-sdk-message__part" key={`${message.id}-${index}`}>
              {value}
            </pre>
          );
        })}
      </div>
    </article>
  );
}
