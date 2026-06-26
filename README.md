# Chatdock SDK

Chatdock SDK is a monorepo for embedding tool-calling chatbots into React apps, Next.js App Router apps, and Supabase-backed workflows.

It gives you the reusable UI, backend handlers, auth and persistence adapters, tooling, schema, and CLI helpers. Your app still owns authentication, authorization, business data access, provider/model choice, secrets, and deployment.

## What it can do

- Render chatbot UIs in React
- Stream chat responses through the AI SDK
- Run backend chat handlers with tool calling
- Expose remote conversation history
- Validate auth from Next.js or Supabase
- Persist chat state, usage, audit, and rate limits through Supabase
- Define safe tools with authorization and human-approval checks
- Add knowledge/RAG tools backed by your own data
- Generate and sync tools from the CLI
- Provide in-memory adapters for local development and tests

## Packages

All packages are published under the `@rsainth/*` scope.

- `@rsainth/chatdock-sdk`: all-in-one package that reexports the SDK surface
- `@rsainth/react`: React components, hooks, transport, and history helpers
- `@rsainth/server`: framework-agnostic backend core, tools, adapters, prompts, tests, and utilities
- `@rsainth/next`: Next.js App Router route helper and header auth adapter
- `@rsainth/supabase`: Supabase chat handler, auth adapter, persistence, observability, rate limit, and knowledge adapters
- `@rsainth/cli`: `init`, `make-tool`, `sync-tools`, and `doctor`

## Install

```bash
npm install @rsainth/chatdock-sdk
```

Install only the pieces you need:

```bash
npm install @rsainth/react @rsainth/server @rsainth/next @rsainth/supabase
npm install -D @rsainth/cli
```

## Quick Start

### 1. Pick your integration path

- Use `@rsainth/next` if your app is a Next.js App Router app.
- Use `@rsainth/supabase` if your runtime is Supabase Edge Functions.
- Use `@rsainth/react` if you only need the UI layer and already have a backend.
- Use `@rsainth/server` when you want the backend core without framework helpers.

### 2. Wire auth and persistence

The SDK does not replace your app auth. Pass your own auth adapter or validate the request before calling the handler.

### 3. Register tools

Define tools on the backend, keep authorization close to the tool, and only expose tools the current user can actually use.

```ts
import { allowRoles, defineTool } from "@rsainth/server";
import { z } from "zod";

const tools = [
  defineTool({
    name: "get_status",
    description: "Returns the current status.",
    inputSchema: z.object({}),
    authorize: allowRoles(["admin"]),
    execute: async () => ({ ok: true }),
  }),
] as const;
```

### 4. Connect the UI

```tsx
import { ChatbotProvider, ChatbotLauncher } from "@rsainth/react";

export function App() {
  return (
    <ChatbotProvider
      endpoint="/api/chat"
      getAuthToken={async () => window.localStorage.getItem("access_token")}
      context={() => ({
        pathname: window.location.pathname,
        search: window.location.search,
      })}
      initialSuggestions={[
        "Summarize this page",
        "What can you help with?",
      ]}
    >
      <ChatbotLauncher />
    </ChatbotProvider>
  );
}
```

## Common Usage Patterns

### Next.js App Router

Use `createNextChatbotRoute` for a chat route and `createHeaderAuthAdapter` when your auth token lives in request headers.

```ts
import { createNextChatbotRoute, createHeaderAuthAdapter } from "@rsainth/next";
import { openai } from "@ai-sdk/openai";

export const POST = createNextChatbotRoute({
  requireAuth: true,
  model: openai("gpt-4o-mini"),
  authAdapter: createHeaderAuthAdapter(async ({ token }) => {
    return token ? { id: token, tenantId: "default" } : null;
  }),
});
```

### Supabase Edge Functions

Use `createSupabaseChatbotHandler` when the chat endpoint lives in Supabase Edge Functions, and pair it with Supabase adapters for auth, persistence, audit, usage, rate limits, and knowledge search.

```ts
import { createSupabaseChatbotHandler, createSupabaseAuthAdapter } from "@rsainth/supabase";
import { openai } from "@ai-sdk/openai";

export const handler = createSupabaseChatbotHandler({
  requireAuth: true,
  model: openai("gpt-4o-mini"),
  auth: createSupabaseAuthAdapter({ client: userClient }),
});
```

### React UI

The React package includes:

- `ChatbotProvider`
- `useChatbot`
- `ChatbotComposer`
- `ChatbotLauncher`
- `ChatbotPanel`
- `ChatbotMessages`
- `ChatbotHistoryPanel`
- `ChatbotDebugPanel`
- `ChatbotErrorBoundary`
- `useChatbotConversations`
- `createConversationHistoryClient`
- `createChatbotTransport`

### Backend core

The server package includes:

- `createChatbotHandler`
- `createConversationHistoryHandler`
- `defineSystemPrompt`
- `createAuditedExecutor`
- tool authorizers such as `allowRoles`, `allowTenant`, `allowFeatureFlag`, `allOfToolAuthorizers`, `anyOfToolAuthorizers`, `createToolPolicyAuthorizer`, `requireHumanApproval`, and `denyDestructiveInDemo`
- tool helpers such as `defineTool`, `createToolRegistry`, `filterAuthorizedTools`, `createToolSuite`, `createToolManifest`, `toolOk`, `toolError`, and `toolDenied`
- tool input normalizers such as `normalizeToolInputFields`, `competenciaSchema`, `coerceLocaleNumber`, `coerceLocaleBoolean`, `coerceLocaleDate`, `sanitizeNullableId`, and `sanitizeHallucinatedId`
- dynamic tool routing with `detectIntent`, `toolsByIntent`, `runtimeConfigAdapter`, and `resolveTools`
- in-memory and noop adapters for persistence, audit, usage, rate limits, and tool execution limits
- knowledge/RAG helpers such as `createKnowledgeTool`
- test helpers such as `createMockRuntimeContext`, `createMockToolContext`, and `runToolTest`

### Supabase adapters

The Supabase package includes:

- `createSupabaseChatbotHandler`
- `createSupabaseAuthAdapter`
- `createSupabasePersistence`
- `createSupabaseAuditAdapter`
- `createSupabaseUsageAdapter`
- `createSupabaseRateLimitAdapter`
- `createSupabaseKnowledgeAdapter`
- `src/supabase/schema.sql` for the production schema

## CLI

The CLI helps you bootstrap and maintain a project:

- `chatdock-sdk init`
- `chatdock-sdk make-tool`
- `chatdock-sdk sync-tools`
- `chatdock-sdk doctor`

Example:

```bash
npx chatdock-sdk init --next --supabase
```

## Production Baseline

The SDK does not host your chatbot. For production, keep the system-owned pieces in your app and configure:

- authenticated chat routes with `requireAuth: true`
- an auth adapter when auth is required
- a model, `models` with `defaultProvider`, or `fallbackModel`
- durable persistence; use `createInMemoryPersistence()` only for demos and tests
- request rate limits for chat and destructive tools
- backend-only secrets and service-role keys
- remote history behind an authenticated route
- authorization close to each tool executor
- business data access in your app, not inside the SDK
- tenant scoping for persistence and knowledge queries
- Supabase RLS and service-role access only where appropriate

See:

- `docs/api-reference.md`
- `docs/getting-started.md`
- `docs/secure-setup.md`
- `docs/security.md`
- `docs/persistence.md`
- `docs/tools.md`

## Examples

- `examples/next-basic`: full Next.js example with chat, history, auth, and generated tools
- `examples/vite-supabase`: Vite + Supabase example
- `examples/migrated-internal-a`
- `examples/migrated-internal-b`

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm lint
```

Before publishing, run the full release check:

```bash
pnpm release:check
```

## Publishing

```bash
npm login
pnpm release:check
pnpm release:version
pnpm release:publish
```

## Notes

- The all-in-one package reexports the server surface.
- `docs/api-reference.md` is the exhaustive public API reference.
- `packages/chatdock-sdk/src/supabase/schema.sql` must stay in sync with `packages/supabase/src/schema.sql`.
- `README.md` is intentionally focused on usage. Deep implementation details live in `docs/`.
