# Persistence

Persistence is an adapter contract. The SDK should not assume the application database, ORM or authorization model.

## Contract

```ts
type ChatbotPersistence = {
  ensureConversation(input: EnsureConversationInput): Promise<Conversation>;
  listConversations(input: ListConversationsInput): Promise<ConversationSummary[]>;
  loadMessages(input: LoadMessagesInput): Promise<UIMessage[]>;
  saveMessage(input: SaveMessageInput): Promise<SavedMessage>;
  deleteConversation(input: DeleteConversationInput): Promise<void>;
  updateConversation(input: UpdateConversationInput): Promise<void>;
};
```

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
import { createInMemoryPersistence } from "@rscheln/chatdock-sdk";

export const persistence = createInMemoryPersistence();
```

Do not use in-memory persistence for production because serverless instances can restart or run in parallel.

## Remote History

Production apps should expose conversation history through an authenticated route backed by the same persistence adapter as chat.

```ts
import { createConversationHistoryHandler } from "@rscheln/chatdock-sdk";

const handler = createConversationHistoryHandler({
  authAdapter: auth,
  persistence,
  basePath: "/api/chat/history",
});

export { handler as GET, handler as PATCH, handler as DELETE };
```

The route lists, searches, loads, renames and deletes conversations scoped by the authenticated user and tenant. See `docs/secure-setup.md` for React remote history wiring.
