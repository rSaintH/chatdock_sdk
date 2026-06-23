import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createChatbotTransport } from "./transport/createChatbotTransport";
import type {
  ChatbotChatController,
  ChatbotContextValue,
  ChatbotLabels,
  ChatbotProviderProps,
  ChatbotTrigger,
} from "./types";

export const defaultChatbotLabels = {
  launcherOpen: "Open chat",
  launcherClose: "Close chat",
  panelTitle: "Assistant",
  panelSubtitle: "Ask a question or request an action.",
  close: "Close",
  composerPlaceholder: "Type your message...",
  composerSend: "Send",
  emptyTitle: "How can I help?",
  emptyDescription: "Start a conversation or choose a suggestion.",
  userLabel: "You",
  assistantLabel: "Assistant",
  toolLabel: "Tool",
  toolRunning: "Running tool",
  toolComplete: "Tool complete",
  toolError: "Tool error",
  approvalTitle: "Approval required",
  approvalDescription: "This action needs explicit confirmation before it can run.",
  approvalConfirm: "Tem certeza?",
  approvalCancel: "Cancelar",
  errorTitle: "Message failed",
  retry: "Try again",
  stop: "Stop",
} satisfies ChatbotLabels;

const ChatbotContext = createContext<ChatbotContextValue | null>(null);

function useLatestRef<T>(value: T) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

export function ChatbotProvider(props: ChatbotProviderProps) {
  const [isOpen, setOpen] = useState(false);
  const [internalConversationId, setInternalConversationId] = useState<string | undefined>(
    props.conversationId,
  );
  const approvalRef = useRef<{ approvedToolNames: string[] } | null>(null);
  const triggerRef = useRef<ChatbotTrigger | undefined>(undefined);
  const activeConversationId = props.conversationId ?? internalConversationId;

  const authTokenRef = useLatestRef(props.getAuthToken);
  const headersRef = useLatestRef(props.getHeaders);
  const contextRef = useLatestRef(props.context);
  const providerRef = useLatestRef(props.provider);
  const conversationIdRef = useLatestRef(activeConversationId);
  const onConversationIdRef = useLatestRef(props.onConversationId);

  useEffect(() => {
    if (props.conversationId !== undefined) {
      setInternalConversationId(props.conversationId);
    }
  }, [props.conversationId]);

  const setConversationId = useCallback(
    (id: string | undefined) => {
      setInternalConversationId(id);
      if (id) {
        onConversationIdRef.current?.(id);
      }
    },
    [onConversationIdRef],
  );

  const transport = useMemo(
    () =>
      createChatbotTransport({
        endpoint: props.endpoint,
        ...(props.getAuthToken ? { getAuthToken: () => authTokenRef.current?.() ?? null } : {}),
        ...(props.getHeaders ? { getHeaders: () => headersRef.current?.() ?? {} } : {}),
        getContext: () => ({
          ...(contextRef.current?.() ?? {}),
          ...(approvalRef.current ?? {}),
        }),
        getConversationId: () => conversationIdRef.current,
        getProvider: () => providerRef.current,
        getTrigger: () => triggerRef.current,
        onConversationId: setConversationId,
      }),
    [
      authTokenRef,
      contextRef,
      conversationIdRef,
      headersRef,
      props.context,
      props.endpoint,
      props.getAuthToken,
      props.getHeaders,
      providerRef,
      setConversationId,
    ],
  );

  const chat = useChat({
    id: conversationIdRef.current,
    transport,
  }) as unknown as ChatbotChatController;

  const labels = useMemo(
    () => ({
      ...defaultChatbotLabels,
      ...props.labels,
    }),
    [props.labels],
  );

  const clientContext = useMemo(
    () => ({
      endpoint: props.endpoint,
      conversationId: activeConversationId,
      provider: props.provider,
      isOpen,
    }),
    [activeConversationId, isOpen, props.endpoint, props.provider],
  );

  const suggestions = useMemo(() => {
    if (typeof props.initialSuggestions === "function") {
      return props.initialSuggestions(clientContext);
    }

    return props.initialSuggestions ?? [];
  }, [clientContext, props.initialSuggestions]);

  const value = useMemo<ChatbotContextValue>(
    () => ({
      endpoint: props.endpoint,
      ...(props.getAuthToken ? { getAuthToken: props.getAuthToken } : {}),
      ...(props.getHeaders ? { getHeaders: props.getHeaders } : {}),
      provider: props.provider,
      conversationId: activeConversationId,
      setConversationId,
      isOpen,
      setOpen,
      toggleOpen: () => setOpen((current) => !current),
      labels,
      suggestions,
      setTrigger: (trigger) => {
        triggerRef.current = trigger;
      },
      approveTool: async (toolName: string, decisionText: string) => {
        triggerRef.current = "approval";
        approvalRef.current = { approvedToolNames: [toolName] };
        try {
          await Promise.resolve(chat.sendMessage({ text: decisionText }));
        } finally {
          approvalRef.current = null;
          triggerRef.current = undefined;
        }
      },
      chat,
    }),
    [
      chat,
      activeConversationId,
      conversationIdRef,
      props.getAuthToken,
      props.getHeaders,
      isOpen,
      labels,
      props.endpoint,
      props.provider,
      setConversationId,
      suggestions,
    ],
  );

  return <ChatbotContext.Provider value={value}>{props.children}</ChatbotContext.Provider>;
}

export function useChatbot() {
  const context = useContext(ChatbotContext);

  if (!context) {
    throw new Error("useChatbot must be used within a ChatbotProvider.");
  }

  return context;
}

export type { UIMessage };
