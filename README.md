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

All packages are published under the `@rscheln/*` scope.

- `@rscheln/chatdock-sdk`: all-in-one package that reexports the SDK surface
- `@rscheln/react`: React components, hooks, transport, and history helpers
- `@rscheln/server`: framework-agnostic backend core, tools, adapters, prompts, tests, and utilities
- `@rscheln/next`: Next.js App Router route helper and header auth adapter
- `@rscheln/supabase`: Supabase chat handler, auth adapter, persistence, observability, rate limit, and knowledge adapters
- `@rscheln/cli`: `init`, `make-tool`, `sync-tools`, and `doctor`

## Install

```bash
npm install @rscheln/chatdock-sdk
```

Install only the pieces you need:

```bash
npm install @rscheln/react @rscheln/server @rscheln/next @rscheln/supabase
npm install -D @rscheln/cli
```

## Quick Start

### 1. Pick your integration path

- Use `@rscheln/next` if your app is a Next.js App Router app.
- Use `@rscheln/supabase` if your runtime is Supabase Edge Functions.
- Use `@rscheln/react` if you only need the UI layer and already have a backend.
- Use `@rscheln/server` when you want the backend core without framework helpers.

### 2. Wire auth and persistence

The SDK does not replace your app auth. Pass your own auth adapter or validate the request before calling the handler.

### 3. Register tools

Define tools on the backend, keep authorization close to the tool, and only expose tools the current user can actually use.

```ts
import { defineTool, allowRoles, createToolRegistry } from "@rscheln/server";

const tools = createToolRegistry([
  defineTool({
    name: "get-status",
    description: "Returns the current status.",
    authorize: allowRoles("admin"),
    execute: async () => ({ ok: true }),
  }),
]);
```

### 4. Connect the UI

```tsx
import { ChatbotProvider, ChatbotLauncher } from "@rscheln/react";

export function App() {
  return (
    <ChatbotProvider transport={/* your transport */}>
      <ChatbotLauncher />
    </ChatbotProvider>
  );
}
```

## Common Usage Patterns

### Next.js App Router

Use `createNextChatbotRoute` for a chat route and `createHeaderAuthAdapter` when your auth token lives in request headers.

```ts
import { createNextChatbotRoute, createHeaderAuthAdapter } from "@rscheln/next";

export const POST = createNextChatbotRoute({
  authAdapter: createHeaderAuthAdapter(async ({ token }) => {
    return { userId: token, tenantId: "default" };
  }),
});
```

### Supabase Edge Functions

Use `createSupabaseChatbotHandler` when the chat endpoint lives in Supabase Edge Functions, and pair it with Supabase adapters for auth, persistence, audit, usage, rate limits, and knowledge search.

```ts
import { createSupabaseChatbotHandler, createSupabaseAuthAdapter } from "@rscheln/supabase";

export const handler = createSupabaseChatbotHandler({
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

## Security Baseline

For production, the recommended baseline is:

- authenticate every chat route
- authorize every tool
- rate limit chat requests
- rate limit destructive tool execution separately
- keep conversation history behind an authenticated backend route
- keep business data access in your app, not inside the SDK
- scope persistence and knowledge queries by tenant when you are multi-tenant
- use Supabase RLS and service-role access only where appropriate

See:

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
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

## Publishing

```bash
npm login
pnpm release:version
pnpm build
pnpm release:publish
```

## Notes

- The all-in-one package reexports the server surface.
- `packages/chatdock-sdk/src/supabase/schema.sql` must stay in sync with `packages/supabase/src/schema.sql`.
- `README.md` is intentionally focused on usage. Deep implementation details live in `docs/`.
