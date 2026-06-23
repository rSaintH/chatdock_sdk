import { forwardRef, type ForwardedRef } from "react";
import { useChatbot } from "../context";
import type { ChatbotSuggestionsProps } from "../types";

type SuggestionsListProps = ChatbotSuggestionsProps & {
  suggestions: string[];
  onSuggestionSelect?: (suggestion: string) => void | Promise<void>;
};

function SuggestionsList(
  {
    className,
    suggestions,
    onSuggestionSelect,
    renderSuggestion,
    children,
    ...props
  }: SuggestionsListProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  if (suggestions.length === 0 && !children) return null;

  return (
    <div
      {...props}
      ref={ref}
      className={["cb-sdk-suggestions", className].filter(Boolean).join(" ")}
    >
      {children ??
        suggestions.map((suggestion, index) => {
          const selectSuggestion = () => {
            void onSuggestionSelect?.(suggestion);
          };

          if (renderSuggestion) {
            return renderSuggestion(suggestion, {
              className: "cb-sdk-suggestion",
              index,
              onSelect: selectSuggestion,
            });
          }

          return (
            <button
              key={`${suggestion}-${index}`}
              type="button"
              className="cb-sdk-suggestion"
              onClick={selectSuggestion}
            >
              {suggestion}
            </button>
          );
        })}
    </div>
  );
}

const ControlledChatbotSuggestions = forwardRef<HTMLDivElement, SuggestionsListProps>(SuggestionsList);

const ContextualChatbotSuggestions = forwardRef<
  HTMLDivElement,
  Omit<ChatbotSuggestionsProps, "onSuggestionSelect" | "suggestions">
>(function ContextualChatbotSuggestions(
  props: Omit<ChatbotSuggestionsProps, "onSuggestionSelect" | "suggestions">,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const chatbot = useChatbot();

  return (
    <ControlledChatbotSuggestions
      {...props}
      ref={ref}
      suggestions={chatbot.suggestions}
      onSuggestionSelect={(suggestion) => {
        chatbot.setTrigger("suggestion");
        return chatbot.chat.sendMessage({ text: suggestion });
      }}
    />
  );
},
);

export const ChatbotSuggestions = forwardRef<HTMLDivElement, ChatbotSuggestionsProps>(
  ({ suggestions, onSuggestionSelect, children, ...props }, ref) => {
    if (suggestions !== undefined || children !== undefined || onSuggestionSelect) {
      return (
        <ControlledChatbotSuggestions
          {...props}
          ref={ref}
          suggestions={suggestions ?? []}
          onSuggestionSelect={onSuggestionSelect}
          children={children}
        />
      );
    }

    return <ContextualChatbotSuggestions {...props} ref={ref} />;
  },
);

ChatbotSuggestions.displayName = "ChatbotSuggestions";
