import { useCallback, useEffect, useMemo, useState } from "react";
import { useChatbot } from "../context";
import { createConversationHistoryClient } from "../history/createConversationHistoryClient";
import type { ChatbotConversationSummary, UseChatbotConversationsOptions } from "../types";

const defaultStorageKey = "chatdock-sdk:conversations";

function readStoredConversations(storageKey: string) {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatbotConversationSummary[]) : [];
  } catch {
    return [];
  }
}

export function useChatbotConversations(options: UseChatbotConversationsOptions = {}) {
  const storageKey = options.storageKey ?? defaultStorageKey;
  const chatbot = useChatbot();
  const mode = options.mode ?? "auto";
  const remoteEnabled = mode !== "local" && Boolean(options.endpoint);
  const fallbackToLocalStorage = options.fallbackToLocalStorage ?? true;
  const [conversations, setConversations] = useState<ChatbotConversationSummary[]>(
    () => options.initialConversations ?? readStoredConversations(storageKey),
  );
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  const client = useMemo(() => {
    if (!remoteEnabled || !options.endpoint) return undefined;

    return createConversationHistoryClient({
      endpoint: options.endpoint,
      getAuthToken: options.getAuthToken ?? chatbot.getAuthToken,
      getHeaders: options.getHeaders ?? chatbot.getHeaders,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }, [
    chatbot.getAuthToken,
    chatbot.getHeaders,
    options.endpoint,
    options.fetch,
    options.getAuthToken,
    options.getHeaders,
    remoteEnabled,
  ]);

  useEffect(() => {
    if (!fallbackToLocalStorage || typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(conversations));
  }, [conversations, fallbackToLocalStorage, storageKey]);

  const refreshConversations = useCallback(
    async (query?: string) => {
      if (!client) {
        setConversations(readStoredConversations(storageKey));
        return;
      }

      setLoading(true);
      setError(undefined);

      try {
        const nextConversations = query
          ? await client.search({ query, limit: options.limit })
          : await client.list({ limit: options.limit });
        setConversations(nextConversations);
      } catch (error) {
        const nextError = error instanceof Error ? error : new Error("Failed to load conversations.");
        setError(nextError);

        if (fallbackToLocalStorage && mode !== "remote") {
          setConversations(readStoredConversations(storageKey));
        }
      } finally {
        setLoading(false);
      }
    },
    [client, fallbackToLocalStorage, mode, options.limit, storageKey],
  );

  useEffect(() => {
    if (!client) return;
    void refreshConversations();
  }, [client, refreshConversations]);

  useEffect(() => {
    if (!chatbot.conversationId) return;
    const conversationId = chatbot.conversationId;

    setConversations((current) => {
      const existing = current.find((conversation) => conversation.id === conversationId);
      const updatedAt = new Date().toISOString();

      if (existing) {
        return current.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, updatedAt } : conversation,
        );
      }

      return [{ id: conversationId, updatedAt }, ...current];
    });
  }, [chatbot.conversationId]);

  const selectConversation = useCallback(
    async (id: string) => {
      chatbot.setConversationId(id);
      chatbot.setOpen(true);

      if (!client) return;

      setLoading(true);
      setError(undefined);

      try {
        const conversation = await client.load(id);
        chatbot.chat.setMessages?.(conversation.messages);
        setConversations((current) => upsertConversation(current, conversation));
      } catch (error) {
        const nextError = error instanceof Error ? error : new Error("Failed to load conversation.");
        setError(nextError);

        if (mode === "remote" || !fallbackToLocalStorage) {
          throw nextError;
        }
      } finally {
        setLoading(false);
      }
    },
    [chatbot, client, fallbackToLocalStorage, mode],
  );

  const removeConversation = useCallback(
    async (id: string) => {
      if (client) {
        setLoading(true);
        setError(undefined);

        try {
          await client.delete(id);
        } catch (error) {
          const nextError = error instanceof Error ? error : new Error("Failed to delete conversation.");
          setError(nextError);

          if (mode === "remote" || !fallbackToLocalStorage) {
            throw nextError;
          }
        } finally {
          setLoading(false);
        }
      }

      setConversations((current) => current.filter((conversation) => conversation.id !== id));
      if (chatbot.conversationId === id) {
        chatbot.setConversationId(undefined);
        chatbot.chat.setMessages?.([]);
      }
    },
    [chatbot, client, fallbackToLocalStorage, mode],
  );

  const clearConversations = useCallback(() => {
    setConversations([]);
    chatbot.setConversationId(undefined);
    chatbot.chat.setMessages?.([]);
  }, [chatbot]);

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      if (!client) {
        const updatedAt = new Date().toISOString();
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === id ? { ...conversation, title, updatedAt } : conversation,
          ),
        );
        return;
      }

      setLoading(true);
      setError(undefined);

      try {
        const conversation = await client.rename(id, title);
        setConversations((current) => upsertConversation(current, conversation));
      } catch (error) {
        const nextError = error instanceof Error ? error : new Error("Failed to rename conversation.");
        setError(nextError);

        if (mode === "remote" || !fallbackToLocalStorage) {
          throw nextError;
        }
      } finally {
        setLoading(false);
      }
    },
    [client, fallbackToLocalStorage, mode],
  );

  const searchConversations = useCallback(
    async (query: string) => {
      await refreshConversations(query);
    },
    [refreshConversations],
  );

  const loadConversation = useCallback(
    async (id: string) => {
      if (!client) return undefined;

      setLoading(true);
      setError(undefined);

      try {
        const conversation = await client.load(id);
        setConversations((current) => upsertConversation(current, conversation));
        return conversation;
      } catch (error) {
        const nextError = error instanceof Error ? error : new Error("Failed to load conversation.");
        setError(nextError);
        throw nextError;
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  return useMemo(
    () => ({
      conversations,
      isLoading,
      error,
      client,
      refreshConversations,
      searchConversations,
      loadConversation,
      selectConversation,
      renameConversation,
      removeConversation,
      clearConversations,
    }),
    [
      clearConversations,
      client,
      conversations,
      error,
      isLoading,
      loadConversation,
      refreshConversations,
      removeConversation,
      renameConversation,
      searchConversations,
      selectConversation,
    ],
  );
}

function upsertConversation(
  conversations: ChatbotConversationSummary[],
  conversation: ChatbotConversationSummary,
): ChatbotConversationSummary[] {
  const existing = conversations.some((current) => current.id === conversation.id);

  if (!existing) {
    return [conversation, ...conversations];
  }

  return conversations.map((current) => (current.id === conversation.id ? { ...current, ...conversation } : current));
}
