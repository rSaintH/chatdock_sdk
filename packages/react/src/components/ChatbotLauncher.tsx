import { forwardRef } from "react";
import { useChatbot } from "../context";
import type { ChatbotLauncherProps } from "../types";

export const ChatbotLauncher = forwardRef<HTMLButtonElement, ChatbotLauncherProps>(
  ({ className, openLabel, closeLabel, type = "button", onClick, ...props }, ref) => {
    const chatbot = useChatbot();
    const label = chatbot.isOpen
      ? (closeLabel ?? chatbot.labels.launcherClose)
      : (openLabel ?? chatbot.labels.launcherOpen);

    return (
      <button
        {...props}
        ref={ref}
        type={type}
        className={["cb-sdk-launcher", className].filter(Boolean).join(" ")}
        aria-expanded={chatbot.isOpen}
        aria-controls="cb-sdk-panel"
        onClick={(event) => {
          chatbot.setTrigger("launcher");
          chatbot.toggleOpen();
          onClick?.(event);
        }}
      >
        <span className="cb-sdk-launcher__label">{label}</span>
      </button>
    );
  },
);

ChatbotLauncher.displayName = "ChatbotLauncher";
