import { forwardRef, useMemo, useState, type FormEvent } from "react";
import { useChatbot } from "../context";
import { useChatbotConversations } from "../hooks/useChatbotConversations";
import type { ChatbotHistoryPanelProps, ChatbotConversationSummary } from "../types";

function formatConversationDate(value: string | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export const ChatbotHistoryPanel = forwardRef<HTMLDivElement, ChatbotHistoryPanelProps>(
  (
    {
      className,
      endpoint,
      mode,
      storageKey,
      initialConversations,
      limit,
      fallbackToLocalStorage,
      searchPlaceholder = "Search conversations",
      emptyLabel = "No conversations yet.",
      loadingLabel = "Loading conversations...",
      title = "History",
      subtitle = "Open, rename, delete or continue past conversations.",
      refreshLabel = "Refresh",
      openLabel = "Open",
      renameLabel = "Rename",
      deleteLabel = "Delete",
      cancelLabel = "Cancel",
      saveLabel = "Save",
      onConversationSelect,
      onConversationRename,
      onConversationDelete,
      ...props
    },
    ref,
  ) => {
    const chatbot = useChatbot();
    const history = useChatbotConversations({
      endpoint,
      mode,
      storageKey,
      initialConversations,
      limit,
      fallbackToLocalStorage,
    });
    const [search, setSearch] = useState("");
    const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
    const [draftTitle, setDraftTitle] = useState("");

    const conversations = useMemo(
      () => [...history.conversations].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      [history.conversations],
    );

    const beginRename = (conversation: ChatbotConversationSummary) => {
      setEditingConversationId(conversation.id);
      setDraftTitle(conversation.title ?? "");
    };

    const cancelRename = () => {
      setEditingConversationId(null);
      setDraftTitle("");
    };

    const selectConversation = async (conversation: ChatbotConversationSummary) => {
      chatbot.setTrigger("programmatic");
      chatbot.setOpen(true);
      if (onConversationSelect) {
        await onConversationSelect(conversation);
      } else {
        await history.selectConversation(conversation.id);
      }
    };

    const renameConversation = async (conversation: ChatbotConversationSummary) => {
      const nextTitle = draftTitle.trim();
      if (!nextTitle) return;

      if (onConversationRename) {
        await onConversationRename(conversation, nextTitle);
      } else {
        await history.renameConversation(conversation.id, nextTitle);
      }

      cancelRename();
    };

    const deleteConversation = async (conversation: ChatbotConversationSummary) => {
      const confirmed =
        typeof window === "undefined" ? true : window.confirm(`Delete conversation "${conversation.id}"?`);
      if (!confirmed) return;

      if (onConversationDelete) {
        await onConversationDelete(conversation);
      } else {
        await history.removeConversation(conversation.id);
      }
    };

    const submitSearch = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await history.searchConversations(search.trim());
    };

    return (
      <div
        {...props}
        ref={ref}
        className={["cb-sdk-history", className].filter(Boolean).join(" ")}
        aria-label="Conversation history"
      >
        <header className="cb-sdk-history__header">
          <div>
            <h3 className="cb-sdk-history__title">{title}</h3>
            <p className="cb-sdk-history__subtitle">{subtitle}</p>
          </div>
          <button
            type="button"
            className="cb-sdk-history__refresh"
            onClick={() => void history.refreshConversations(search.trim() || undefined)}
          >
            {refreshLabel}
          </button>
        </header>

        <form className="cb-sdk-history__search" onSubmit={submitSearch}>
          <input
            className="cb-sdk-history__searchInput"
            value={search}
            placeholder={searchPlaceholder}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </form>

        {history.error ? <div className="cb-sdk-history__error">{history.error.message}</div> : null}
        {history.isLoading ? <div className="cb-sdk-history__loading">{loadingLabel}</div> : null}

        {conversations.length === 0 ? (
          <div className="cb-sdk-history__empty">{emptyLabel}</div>
        ) : (
          <div className="cb-sdk-history__list">
            {conversations.map((conversation) => {
              const isCurrent = conversation.id === chatbot.conversationId;
              const isEditing = editingConversationId === conversation.id;
              const formattedDate = formatConversationDate(conversation.updatedAt);

              return (
                <section
                  key={conversation.id}
                  className={["cb-sdk-history__item", isCurrent && "cb-sdk-history__item--current"]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="cb-sdk-history__itemMeta">
                    <div className="cb-sdk-history__itemTitle">
                      {isEditing ? (
                        <input
                          className="cb-sdk-history__renameInput"
                          value={draftTitle}
                          onChange={(event) => setDraftTitle(event.currentTarget.value)}
                          autoFocus
                        />
                      ) : (
                        <span>{conversation.title ?? conversation.id}</span>
                      )}
                    </div>
                    <div className="cb-sdk-history__itemDetails">
                      <code>{conversation.id}</code>
                      {formattedDate ? <span>{formattedDate}</span> : null}
                    </div>
                  </div>

                  <div className="cb-sdk-history__actions">
                    {isEditing ? (
                      <>
                        <button type="button" onClick={() => void renameConversation(conversation)}>
                          {saveLabel}
                        </button>
                        <button type="button" onClick={cancelRename}>
                          {cancelLabel}
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => void selectConversation(conversation)}>
                          {openLabel}
                        </button>
                        <button type="button" onClick={() => beginRename(conversation)}>
                          {renameLabel}
                        </button>
                        <button type="button" onClick={() => void deleteConversation(conversation)}>
                          {deleteLabel}
                        </button>
                      </>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    );
  },
);

ChatbotHistoryPanel.displayName = "ChatbotHistoryPanel";
