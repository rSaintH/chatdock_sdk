# Persistence

Persistence is an adapter contract. The SDK does not assume the application database, ORM, or authorization model.

## Contract

```ts
type PersistenceAdapter = {
  getOrCreateConversation(input: {
    conversationId?: string;
    user: ChatbotUser | null;
    context: ChatbotClientContext;
  }): Promise<ConversationRecord>;
  loadMessages(input: {
    conversationId: string;
    user: ChatbotUser | null;
  }): Promise<UIMessage[]>;
  saveMessage(input: {
    conversationId: string;
    user: ChatbotUser | null;
    message: UIMessage;
  }): Promise<void>;
  saveMessages?(input: {
    conversationId: string;
    user: ChatbotUser | null;
    messages: UIMessage[];
  }): Promise<void>;
  listConversations?(input: {
    user: ChatbotUser | null;
    limit?: number;
  }): Promise<ConversationRecord[]>;
  loadConversation?(input: {
    conversationId: string;
    user: ChatbotUser | null;
  }): Promise<ConversationRecordWithMessages | null>;
  updateConversation?(input: {
    conversationId: string;
    user: ChatbotUser | null;
    title?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ConversationRecord | null>;
  deleteConversation?(input: {
    conversationId: string;
    user: ChatbotUser | null;
  }): Promise<void | boolean>;
  searchConversations?(input: {
    user: ChatbotUser | null;
    query: string;
    limit?: number;
  }): Promise<ConversationRecord[]>;
};
```

`getOrCreateConversation`, `loadMessages`, and `saveMessage` are the required pieces for the chat handler. The history route can use the optional methods when they are available.

## Recommended Tables

For Supabase projects, the optional base schema should use internal chatbot tables:

- `ai_conversations`
- `ai_messages`
- `ai_tool_audit`
- `ai_usage_events`
- `ai_settings`

Keep these separate from business tables.

The base schema also includes:

- `ai_rate_limits`
- `ai_check_rate_limit`

Those support fixed-window request limits through the Supabase adapter.

## Authorization

Persistence authorization and business authorization are different concerns.

- Use service role only for internal conversation persistence and audit writes.
- Use the authenticated user client for business data queries when preserving RLS matters.
- Never use service role inside business tools to bypass user permissions.
- Prefer `createSupabasePersistence({ requireTenant: true })` for internal multi-tenant apps.
- Keep `ai_*` tables backend-only unless the product deliberately adds narrow RLS policies for direct browser reads.

## Message History

The backend should load only the history needed for the model:

- cap the number of messages
- cap payload size
- remove or summarize oversized tool outputs
- preserve the final assistant response for conversation continuity

## Local Development

For demos and tests, an in-memory adapter is acceptable:

```ts
import { createInMemoryPersistence } from "@rsainth/chatdock-sdk";

export const persistence = createInMemoryPersistence();
```

Do not use in-memory persistence for production because serverless instances can restart or run in parallel.

## Remote History

Production apps should expose conversation history through an authenticated route backed by the same persistence adapter as chat.

```ts
import { createConversationHistoryHandler } from "@rsainth/chatdock-sdk";

const handler = createConversationHistoryHandler({
  authAdapter: auth,
  persistence,
  basePath: "/api/chat/history",
});

export { handler as GET, handler as PATCH, handler as DELETE };
```

The route lists, searches, loads, renames, and deletes conversations scoped by the authenticated user and tenant. See `docs/secure-setup.md` for React remote history wiring.
