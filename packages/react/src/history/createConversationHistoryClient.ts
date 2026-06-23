import type {
  ChatbotConversation,
  ChatbotConversationListOptions,
  ChatbotConversationSearchOptions,
  ChatbotConversationSummary,
  ChatbotHistoryClientOptions,
} from "../types";

export type ChatbotConversationHistoryClient = {
  list: (options?: ChatbotConversationListOptions) => Promise<ChatbotConversationSummary[]>;
  search: (options: ChatbotConversationSearchOptions) => Promise<ChatbotConversationSummary[]>;
  load: (conversationId: string) => Promise<ChatbotConversation>;
  rename: (conversationId: string, title: string) => Promise<ChatbotConversationSummary>;
  delete: (conversationId: string) => Promise<void>;
};

type ConversationCollectionResponse = {
  conversations?: unknown;
};

type ConversationResponse = {
  conversation?: unknown;
};

function mergeHeaders(...headersList: Array<HeadersInit | undefined>): Headers {
  const headers = new Headers();

  for (const headersInit of headersList) {
    if (!headersInit) continue;
    new Headers(headersInit).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
}

export function createConversationHistoryClient(
  options: ChatbotHistoryClientOptions,
): ChatbotConversationHistoryClient {
  const fetcher = options.fetch ?? fetch;

  async function buildHeaders(headersInit?: HeadersInit) {
    const token = await options.getAuthToken?.();
    const consumerHeaders = await options.getHeaders?.();
    const headers = mergeHeaders(consumerHeaders, headersInit);

    if (token && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${token}`);
    }

    return headers;
  }

  async function requestJson<T>(url: URL, init: RequestInit = {}): Promise<T> {
    const headers = await buildHeaders(init.headers);
    const response = await fetcher(url, {
      ...init,
      headers,
    });

    if (!response.ok) {
      throw await createHistoryClientError(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  return {
    async list(listOptions = {}) {
      const url = createCollectionUrl(options.endpoint, listOptions);
      const body = await requestJson<ConversationCollectionResponse>(url);
      return parseConversationList(body.conversations);
    },
    async search(searchOptions) {
      const url = createCollectionUrl(options.endpoint, {
        limit: searchOptions.limit,
        query: searchOptions.query,
      });
      const body = await requestJson<ConversationCollectionResponse>(url);
      return parseConversationList(body.conversations);
    },
    async load(conversationId) {
      const url = createConversationUrl(options.endpoint, conversationId);
      const body = await requestJson<ConversationResponse>(url);
      return parseConversation(body.conversation);
    },
    async rename(conversationId, title) {
      const url = createConversationUrl(options.endpoint, conversationId);
      const body = await requestJson<ConversationResponse>(url, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      return parseConversationSummary(body.conversation);
    },
    async delete(conversationId) {
      const url = createConversationUrl(options.endpoint, conversationId);
      await requestJson<void>(url, { method: "DELETE" });
    },
  };
}

function createCollectionUrl(
  endpoint: string,
  options: ChatbotConversationListOptions & { query?: string },
): URL {
  const url = new URL(endpoint, getUrlBase());

  if (options.limit !== undefined) {
    url.searchParams.set("limit", String(options.limit));
  }

  if (options.query) {
    url.searchParams.set("search", options.query);
  }

  return url;
}

function createConversationUrl(endpoint: string, conversationId: string): URL {
  const url = createCollectionUrl(endpoint, {});
  const suffix = encodeURIComponent(conversationId);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${suffix}`;
  return url;
}

function getUrlBase(): string {
  if (typeof window !== "undefined") {
    return window.location.href;
  }

  return "http://localhost";
}

async function createHistoryClientError(response: Response): Promise<Error> {
  let message = `Conversation history request failed with status ${response.status}.`;

  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) {
      message = body.error;
    }
  } catch {
    // Keep the status-based message when the server does not return JSON.
  }

  const error = new Error(message);
  error.name = "ChatbotHistoryClientError";
  return error;
}

function parseConversationList(value: unknown): ChatbotConversationSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(parseConversationSummary);
}

function parseConversation(value: unknown): ChatbotConversation {
  const summary = parseConversationSummary(value);
  const messages = isRecord(value) && Array.isArray(value.messages) ? value.messages : [];

  return {
    ...summary,
    messages: messages as ChatbotConversation["messages"],
  };
}

function parseConversationSummary(value: unknown): ChatbotConversationSummary {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new Error("Conversation history response did not include a valid conversation.");
  }

  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString();
  const metadata = isRecord(value.metadata) ? value.metadata : undefined;

  return {
    id: value.id,
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    ...(typeof value.createdAt === "string" ? { createdAt: value.createdAt } : {}),
    updatedAt,
    ...(metadata ? { metadata } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
