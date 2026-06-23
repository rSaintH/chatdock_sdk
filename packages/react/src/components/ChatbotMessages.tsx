import { forwardRef } from "react";
import { useChatbot } from "../context";
import type { ChatbotMessagesProps } from "../types";
import { ChatbotMessage } from "./ChatbotMessage";

export const ChatbotMessages = forwardRef<HTMLDivElement, ChatbotMessagesProps>(
  ({ className, messages, renderMessage, renderPart, ...props }, ref) => {
    const chatbot = useChatbot();
    const visibleMessages = messages ?? chatbot.chat.messages;

    return (
      <div
        {...props}
        ref={ref}
        className={["cb-sdk-messages", className].filter(Boolean).join(" ")}
        role="log"
        aria-live="polite"
      >
        {visibleMessages.map((message) => {
          if (renderMessage) {
            return <div key={message.id}>{renderMessage(message)}</div>;
          }

          return (
            <ChatbotMessage
              key={message.id}
              message={message}
              labels={chatbot.labels}
              renderPart={renderPart}
            />
          );
        })}
      </div>
    );
  },
);

ChatbotMessages.displayName = "ChatbotMessages";

export const MessageList = ChatbotMessages;
