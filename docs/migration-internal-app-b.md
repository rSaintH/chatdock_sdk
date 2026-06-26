# Migration: Internal App B

This guide describes the recommended path for migrating an existing internal application to the Chatdock SDK.

## 1. Inventory Existing Chat Behavior

Document the current assistant entry points:

- frontend component or page where users open chat
- backend endpoint or Supabase Edge Function that calls the model
- provider and model configuration
- current prompts
- existing function calling or ad hoc actions
- persistence tables, if any
- audit or logging behavior

## 2. Add The SDK Boundary

Install the packages needed by the app shape:

```bash
pnpm add @rsainth/chatdock-sdk
```

Use `@rsainth/chatdock-sdk/next` for Next.js routes or `@rsainth/chatdock-sdk/supabase` for Supabase Edge Functions.

Run:

```bash
npx chatdock-sdk init
```

## 3. Move Prompt Rules

Move existing assistant instructions into `chatbot/system-prompt.ts`:

- identity
- language
- business rules
- refusal rules
- privacy rules
- page context

Keep secrets, SQL and implementation details out of prompt text.

## 4. Convert Actions Into Tools

For each current action, create:

```txt
chatbot/tools/<action-name>/index.ts
```

Use `snake_case` tool names and keep descriptions short. Business queries should use the same authorization model the current app uses today.

After each tool migration:

```bash
npx chatdock-sdk sync-tools
npx chatdock-sdk doctor
```

## 5. Wire Persistence

If the application already stores conversations, implement the SDK persistence contract over the existing tables or create the standard `ai_*` tables. Prefer a small adapter over changing business tables.

## 6. Rollout

Recommended rollout order:

1. ship the UI with no tools
2. enable read-only tools
3. enable audited tools
4. add dangerous tools only after confirmation support exists

Keep the old chat path available until the SDK route has equivalent behavior and observability.
