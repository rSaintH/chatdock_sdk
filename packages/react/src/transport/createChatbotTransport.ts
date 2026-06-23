import { DefaultChatTransport } from "ai";
import type { ChatbotTransportOptions } from "../types";

type TransportInit = ConstructorParameters<typeof DefaultChatTransport>[0];

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

function readLastUserMessage(options: Record<string, unknown>) {
  const message = options.message;
  if (message && typeof message === "object") return message;

  const messages = options.messages;
  if (!Array.isArray(messages)) return undefined;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const current = messages[index];
    if (current && typeof current === "object" && "role" in current && current.role === "user") {
      return current;
    }
  }

  return messages.at(-1);
}

export function createChatbotTransport(options: ChatbotTransportOptions) {
  async function buildHeaders() {
    const token = await options.getAuthToken?.();
    const consumerHeaders = await options.getHeaders?.();
    const headers = mergeHeaders(consumerHeaders);

    if (token && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${token}`);
    }

    return Object.fromEntries(headers.entries());
  }

  function buildBody(requestOptions: Record<string, unknown>) {
    return {
      conversationId: options.getConversationId?.(),
      provider: options.getProvider?.(),
      trigger: options.getTrigger?.(),
      context: options.getContext?.(),
      message: readLastUserMessage(requestOptions),
    };
  }

  const transportOptions = {
    api: options.endpoint,
    headers: buildHeaders,
    body: buildBody,
    prepareSendMessagesRequest: async (requestOptions: Record<string, unknown>) => ({
      headers: await buildHeaders(),
      body: buildBody(requestOptions),
    }),
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetch(input, init);
      const conversationId = response.headers.get("x-conversation-id");

      if (conversationId) {
        options.onConversationId?.(conversationId);
      }

      return response;
    },
  } satisfies Record<string, unknown>;

  return new DefaultChatTransport(transportOptions as TransportInit);
}
