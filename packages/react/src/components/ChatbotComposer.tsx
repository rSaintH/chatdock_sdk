import { forwardRef, useState, type FormEvent } from "react";
import { useChatbot } from "../context";
import type { ChatbotComposerProps } from "../types";

export const ChatbotComposer = forwardRef<HTMLFormElement, ChatbotComposerProps>(
  ({ className, placeholder, autoFocus, disabled, onSubmit, children, ...props }, ref) => {
    const chatbot = useChatbot();
    const [text, setText] = useState("");
    const isBusy = chatbot.chat.status === "submitted" || chatbot.chat.status === "streaming";
    const isDisabled = disabled ?? false;

    async function submitForm(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      const trimmed = text.trim();

      if (!trimmed || isDisabled) return;

      chatbot.setTrigger("composer");

      if (onSubmit) {
        await onSubmit(trimmed);
      } else {
        await chatbot.chat.sendMessage({ text: trimmed });
      }

      setText("");
    }

    return (
      <form
        {...props}
        ref={ref}
        className={["cb-sdk-composer", className].filter(Boolean).join(" ")}
        onSubmit={submitForm}
      >
        {children ?? (
          <>
            <textarea
              className="cb-sdk-composer__input"
              value={text}
              placeholder={placeholder ?? chatbot.labels.composerPlaceholder}
              autoFocus={autoFocus}
              disabled={isDisabled}
              rows={1}
              onChange={(event) => setText(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            {isBusy && chatbot.chat.stop ? (
              <button className="cb-sdk-composer__button" type="button" onClick={chatbot.chat.stop}>
                {chatbot.labels.stop}
              </button>
            ) : (
              <button className="cb-sdk-composer__button" type="submit" disabled={!text.trim() || isDisabled}>
                {chatbot.labels.composerSend}
              </button>
            )}
          </>
        )}
      </form>
    );
  },
);

ChatbotComposer.displayName = "ChatbotComposer";
