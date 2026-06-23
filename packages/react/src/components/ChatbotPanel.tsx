import { forwardRef } from "react";
import { useChatbot } from "../context";
import { ChatbotComposer } from "./ChatbotComposer";
import { ChatbotMessages } from "./ChatbotMessages";
import { ChatbotSuggestions } from "./ChatbotSuggestions";
import type { ChatbotComposerProps, ChatbotMessagesProps, ChatbotPanelProps } from "../types";

export const ChatbotPanel = forwardRef<HTMLDivElement, ChatbotPanelProps>(
  ({ className, header, footer, renderMessages, renderComposer, children, ...props }, ref) => {
    const chatbot = useChatbot();
    const hasMessages = chatbot.chat.messages.length > 0;
    const messagesProps = {} satisfies ChatbotMessagesProps;
    const composerProps = {} satisfies ChatbotComposerProps;

    if (!chatbot.isOpen) return null;

    return (
      <section
        {...props}
        ref={ref}
        id="cb-sdk-panel"
        className={["cb-sdk-panel", className].filter(Boolean).join(" ")}
        aria-label={chatbot.labels.panelTitle}
      >
        {header ?? (
          <header className="cb-sdk-panel__header">
            <div>
              <h2 className="cb-sdk-panel__title">{chatbot.labels.panelTitle}</h2>
              <p className="cb-sdk-panel__subtitle">{chatbot.labels.panelSubtitle}</p>
            </div>
            <button className="cb-sdk-panel__close" type="button" onClick={() => chatbot.setOpen(false)}>
              {chatbot.labels.close}
            </button>
          </header>
        )}

        {children ?? (
          <>
            {!hasMessages ? (
              <div className="cb-sdk-empty">
                <h3>{chatbot.labels.emptyTitle}</h3>
                <p>{chatbot.labels.emptyDescription}</p>
                <ChatbotSuggestions />
              </div>
            ) : null}

            {renderMessages ? renderMessages(messagesProps) : <ChatbotMessages />}

            {chatbot.chat.error ? (
              <div className="cb-sdk-error" role="alert">
                <strong>{chatbot.labels.errorTitle}</strong>
                <span>{chatbot.chat.error.message}</span>
                {chatbot.chat.regenerate ? (
                  <button
                    type="button"
                    className="cb-sdk-error__retry"
                    onClick={() => void chatbot.chat.regenerate?.()}
                  >
                    {chatbot.labels.retry}
                  </button>
                ) : null}
              </div>
            ) : null}

            {renderComposer ? renderComposer(composerProps) : <ChatbotComposer />}
          </>
        )}

        {footer}
      </section>
    );
  },
);

ChatbotPanel.displayName = "ChatbotPanel";
