import type { UIMessage } from "ai";
import type * as React from "react";

export type ChatbotProviderValue = "auto" | string;

export type ChatbotTrigger = "launcher" | "composer" | "suggestion" | "programmatic" | string;

export type ChatbotClientContext = {
  endpoint: string;
  conversationId?: string;
  provider?: ChatbotProviderValue;
  isOpen: boolean;
};

export type ChatbotLabels = {
  launcherOpen: string;
  launcherClose: string;
  panelTitle: string;
  panelSubtitle: string;
  close: string;
  composerPlaceholder: string;
  composerSend: string;
  emptyTitle: string;
  emptyDescription: string;
  userLabel: string;
  assistantLabel: string;
  toolLabel: string;
  toolRunning: string;
  toolComplete: string;
  toolError: string;
  approvalTitle: string;
  approvalDescription: string;
  approvalConfirm: string;
  approvalCancel: string;
  errorTitle: string;
  retry: string;
  stop: string;
};

export type ChatbotProviderProps = {
  endpoint: string;
  getAuthToken?: () => string | null | undefined | Promise<string | null | undefined>;
  getHeaders?: () => HeadersInit | Promise<HeadersInit>;
  context?: () => Record<string, unknown>;
  conversationId?: string;
  onConversationId?: (id: string) => void;
  provider?: ChatbotProviderValue;
  initialSuggestions?: string[] | ((context: ChatbotClientContext) => string[]);
  labels?: Partial<ChatbotLabels>;
  children: React.ReactNode;
};

export type ChatbotTransportOptions = {
  endpoint: string;
  getAuthToken?: ChatbotProviderProps["getAuthToken"];
  getHeaders?: ChatbotProviderProps["getHeaders"];
  getContext?: ChatbotProviderProps["context"];
  getConversationId?: () => string | undefined;
  onConversationId?: (id: string) => void;
  getProvider?: () => ChatbotProviderValue | undefined;
  getTrigger?: () => ChatbotTrigger | undefined;
};

export type ChatbotContextValue = {
  endpoint: string;
  getAuthToken?: ChatbotProviderProps["getAuthToken"];
  getHeaders?: ChatbotProviderProps["getHeaders"];
  provider?: ChatbotProviderValue;
  conversationId?: string;
  setConversationId: (id: string | undefined) => void;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  labels: ChatbotLabels;
  suggestions: string[];
  setTrigger: (trigger: ChatbotTrigger | undefined) => void;
  approveTool: (toolName: string, decisionText: string) => Promise<void>;
  chat: ChatbotChatController;
};

export type ChatbotChatController = {
  messages: UIMessage[];
  status?: "submitted" | "streaming" | "ready" | "error" | string;
  error?: Error;
  sendMessage: (message: { text: string } & Record<string, unknown>) => void | Promise<void>;
  stop?: () => void;
  regenerate?: () => void | Promise<void>;
  setMessages?: (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void;
};

export type ChatbotLauncherProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  openLabel?: React.ReactNode;
  closeLabel?: React.ReactNode;
};

export type ChatbotPanelProps = React.HTMLAttributes<HTMLDivElement> & {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  renderMessages?: (props: ChatbotMessagesProps) => React.ReactNode;
  renderComposer?: (props: ChatbotComposerProps) => React.ReactNode;
};

export type ChatbotHistoryPanelProps = React.HTMLAttributes<HTMLDivElement> & {
  endpoint?: string;
  mode?: "local" | "remote" | "auto";
  storageKey?: string;
  initialConversations?: ChatbotConversationSummary[];
  limit?: number;
  fallbackToLocalStorage?: boolean;
  searchPlaceholder?: string;
  emptyLabel?: string;
  loadingLabel?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  refreshLabel?: React.ReactNode;
  openLabel?: React.ReactNode;
  renameLabel?: React.ReactNode;
  deleteLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  saveLabel?: React.ReactNode;
  onConversationSelect?: (conversation: ChatbotConversationSummary) => void | Promise<void>;
  onConversationRename?: (
    conversation: ChatbotConversationSummary,
    title: string,
  ) => void | Promise<void>;
  onConversationDelete?: (conversation: ChatbotConversationSummary) => void | Promise<void>;
};

export type ChatbotComposerProps = Omit<React.FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  onSubmit?: (text: string) => void | Promise<void>;
};

export type ChatbotMessagesProps = React.HTMLAttributes<HTMLDivElement> & {
  messages?: UIMessage[];
  renderMessage?: (message: UIMessage) => React.ReactNode;
  renderPart?: (part: UIMessage["parts"][number], message: UIMessage, index: number) => React.ReactNode;
};

export type ChatbotSuggestionRenderProps = {
  className: string;
  index: number;
  onSelect: () => void;
};

export type ChatbotSuggestionsProps = React.HTMLAttributes<HTMLDivElement> & {
  suggestions?: string[];
  onSuggestionSelect?: (suggestion: string) => void | Promise<void>;
  renderSuggestion?: (suggestion: string, props: ChatbotSuggestionRenderProps) => React.ReactNode;
};

export type ChatbotMessageProps = React.HTMLAttributes<HTMLElement> & {
  message: UIMessage;
  labels: Pick<
    ChatbotLabels,
    | "assistantLabel"
    | "toolLabel"
    | "userLabel"
    | "approvalTitle"
    | "approvalDescription"
    | "approvalConfirm"
    | "approvalCancel"
  >;
  renderPart?: ChatbotMessagesProps["renderPart"];
};

export type ChatbotConversationSummary = {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

export type ChatbotConversation = ChatbotConversationSummary & {
  messages: UIMessage[];
};

export type ChatbotDebugTraceTool = {
  name: string;
  description: string;
  destructive?: boolean;
  requiresConfirmation?: boolean;
  timeoutMs?: number;
  enabled?: boolean;
};

export type ChatbotDebugTraceMessagePart = {
  type: string;
  redacted?: boolean;
  [key: string]: unknown;
};

export type ChatbotDebugTraceMessage = {
  id?: string;
  role: string;
  parts: ChatbotDebugTraceMessagePart[];
};

export type ChatbotDebugTrace = {
  requestId: string;
  conversationId: string;
  provider?: string;
  model?: string;
  systemPrompt: string | null;
  messages: ChatbotDebugTraceMessage[];
  tools: ChatbotDebugTraceTool[];
  createdAt: string | Date;
};

export type ChatbotDebugTraceEvent =
  | {
      type: "request.started";
      conversationId?: string;
      createdAt: string | Date;
      user: { id: string } | null;
    }
  | {
      type: "request.finished";
      conversationId: string;
      durationMs: number;
      createdAt: string | Date;
      user: { id: string } | null;
    }
  | {
      type: "request.failed";
      conversationId?: string;
      error: string;
      code: string;
      durationMs: number;
      createdAt: string | Date;
      user: { id: string } | null;
    }
  | {
      type: "model.started";
      conversationId: string;
      provider?: string;
      model?: string;
      createdAt: string | Date;
      user: { id: string } | null;
    }
  | {
      type: "model.finished";
      conversationId: string;
      provider?: string;
      model?: string;
      durationMs: number;
      createdAt: string | Date;
      user: { id: string } | null;
    }
  | {
      type: "model.error";
      conversationId: string;
      provider?: string;
      model?: string;
      error: string;
      code: string;
      createdAt: string | Date;
      user: { id: string } | null;
    }
  | {
      type: "trace.snapshot";
      conversationId: string;
      trace: ChatbotDebugTrace;
      createdAt: string | Date;
      user: { id: string } | null;
    }
  | {
      type: "tool.started";
      conversationId: string;
      toolName: string;
      toolCallId?: string;
      input: unknown;
      createdAt: string | Date;
      user: { id: string } | null;
    }
  | {
      type: "tool.finished";
      conversationId: string;
      toolName: string;
      toolCallId?: string;
      input: unknown;
      output: unknown;
      durationMs: number;
      createdAt: string | Date;
      user: { id: string } | null;
    }
  | {
      type: "tool.failed";
      conversationId: string;
      toolName: string;
      toolCallId?: string;
      input: unknown;
      error: string;
      code: string;
      durationMs: number;
      createdAt: string | Date;
      user: { id: string } | null;
    };

export type ChatbotDebugPanelProps = React.HTMLAttributes<HTMLDivElement> & {
  trace?: ChatbotDebugTrace;
  events?: ChatbotDebugTraceEvent[];
  emptyLabel?: string;
};

export type ChatbotHistoryClientOptions = {
  endpoint: string;
  getAuthToken?: ChatbotProviderProps["getAuthToken"];
  getHeaders?: ChatbotProviderProps["getHeaders"];
  fetch?: typeof fetch;
};

export type ChatbotConversationListOptions = {
  limit?: number;
};

export type ChatbotConversationSearchOptions = ChatbotConversationListOptions & {
  query: string;
};

export type UseChatbotConversationsOptions = {
  storageKey?: string;
  initialConversations?: ChatbotConversationSummary[];
  endpoint?: string;
  getAuthToken?: ChatbotProviderProps["getAuthToken"];
  getHeaders?: ChatbotProviderProps["getHeaders"];
  fetch?: typeof fetch;
  limit?: number;
  mode?: "local" | "remote" | "auto";
  fallbackToLocalStorage?: boolean;
};
