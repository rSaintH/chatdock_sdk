# @rsainth/chatdock-sdk

All-in-one SDK for adding tool-calling chatbots to React, Next.js App Router, and Supabase Edge Function applications.

The package provides frontend components, a streaming backend handler, adapters, tool helpers, persistence helpers, and a CLI for generating the chatbot folder structure. Your application remains responsible for authentication, authorization, business data access, model/provider configuration, secrets, and production persistence.

## Features

- React chat UI with launcher, panel, message list, composer, hooks, and styles.
- Next.js App Router route helper for streaming AI SDK responses.
- Supabase Edge Function helper, auth adapter, persistence adapter, and audit adapter.
- Backend tool definitions with runtime context, typed services, authorization hooks, and audit events.
- System prompt composition from static and dynamic blocks.
- Conversation persistence adapter contract with in-memory and Supabase implementations.
- CLI commands for project initialization, tool discovery, generated tool catalogs, and project checks.

## Installation

```bash
npm install @rsainth/chatdock-sdk
```

Install the peer dependencies that match your runtime:

```bash
npm install ai
npm install react react-dom
```

For Next.js apps:

```bash
npm install next
```

For Supabase projects:

```bash
npm install @supabase/supabase-js
```

If you use a specific AI SDK model provider, install that provider package as well, for example:

```bash
npm install @ai-sdk/openai
```

The examples below use Zod schemas for tool inputs:

```bash
npm install zod
```

## Quick Start

Initialize the chatbot files in your application:

```bash
npx chatdock-sdk init
```

The command creates a starter `chatbot/` folder:

```txt
chatbot/
  auth.ts
  config.ts
  context.ts
  local-model.ts
  persistence.ts
  system-prompt.ts
  tools.generated.ts
  tools/
    example-tool/
      index.ts
```

Replace the generated placeholders with your application's auth, permissions, persistence, services, and tools.

## React UI

Import the stylesheet once in your app:

```ts
import "@rsainth/chatdock-sdk/styles.css";
```

Wrap your app shell with `ChatbotProvider` and render `ChatbotLauncher`:

```tsx
import { ChatbotLauncher, ChatbotProvider } from "@rsainth/chatdock-sdk/react";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ChatbotProvider
      endpoint="/api/chat"
      getAuthToken={async () => {
        return localStorage.getItem("access_token");
      }}
      context={() => ({
        pathname: window.location.pathname,
        search: window.location.search,
      })}
      initialSuggestions={[
        "Summarize this page",
        "Show my pending tasks",
        "Help me find a customer",
      ]}
      labels={{
        panelTitle: "Assistant",
        composerPlaceholder: "Ask a question...",
      }}
    >
      {children}
      <ChatbotLauncher />
    </ChatbotProvider>
  );
}
```

The frontend only sends messages, authentication headers, the current conversation id, provider selection, trigger metadata, and public request context. Do not import backend tools, service role keys, model API keys, or persistence adapters into client code.

## Next.js App Router

Create a route such as `app/api/chat/route.ts`:

```ts
import { openai } from "@ai-sdk/openai";
import { createNextChatbotRoute } from "@rsainth/chatdock-sdk/next";
import { createInMemoryPersistence } from "@rsainth/chatdock-sdk";
import { auth } from "@/chatbot/auth";
import { systemPrompt } from "@/chatbot/system-prompt";
import { tools } from "@/chatbot/tools.generated";

export const POST = createNextChatbotRoute({
  model: openai("gpt-4o-mini"),
  requireAuth: true,
  auth,
  persistence: createInMemoryPersistence(),
  systemPrompt,
  tools,
  maxSteps: 5,
});
```

For production, replace `createInMemoryPersistence()` with a database-backed adapter. The in-memory adapter is useful for demos and tests, but serverless instances can restart or run in parallel.

### Header Auth Adapter

Use `createHeaderAuthAdapter` when your frontend sends a bearer token:

```ts
import { createHeaderAuthAdapter } from "@rsainth/chatdock-sdk/next";

export const auth = createHeaderAuthAdapter(async ({ token }) => {
  if (!token) {
    return null;
  }

  const user = await verifySessionToken(token);

  return {
    id: user.id,
    roles: user.roles,
    tenantId: user.tenantId,
  };
});
```

## Supabase Edge Functions

The Supabase entrypoint exports a handler helper, auth adapter, persistence adapter, and audit adapter:

```ts
import { openai } from "@ai-sdk/openai";
import {
  createSupabaseAuditAdapter,
  createSupabaseAuthAdapter,
  createSupabaseChatbotHandler,
  createSupabasePersistence,
  createSupabaseRateLimitAdapter,
  createSupabaseUsageAdapter,
} from "@rsainth/chatdock-sdk/supabase";
import { createClient } from "@supabase/supabase-js";
import { systemPrompt } from "../_shared/chatbot/system-prompt.ts";
import { tools } from "../_shared/chatbot/tools.generated.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const userClient = createClient(supabaseUrl, anonKey);
const adminClient = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(
  createSupabaseChatbotHandler({
    model: openai("gpt-4o-mini"),
    requireAuth: true,
    auth: createSupabaseAuthAdapter({ client: userClient }),
    persistence: createSupabasePersistence({ adminClient, requireTenant: true }),
    rateLimitAdapter: createSupabaseRateLimitAdapter({
      adminClient,
      keyPrefix: "my-app",
    }),
    auditAdapter: createSupabaseAuditAdapter(adminClient),
    usageAdapter: createSupabaseUsageAdapter({ adminClient }),
    systemPrompt,
    tools,
  }),
);
```

Use the admin client only for internal chatbot tables such as conversations, messages, audit rows, usage events, rate limit counters, and settings. Business tools should use the authenticated user's permissions unless the tool is explicitly internal and carefully reviewed.

The base schema is available through this package subpath:

```txt
@rsainth/chatdock-sdk/supabase/schema.sql
```

You can also inspect it in the package at `src/supabase/schema.sql`.

## Defining Tools

Tools are backend-only functions. They should live under `chatbot/tools/**/index.ts` so the CLI can discover and generate the catalog.

```ts
import { allowRoles, allowTenant, allOfToolAuthorizers, defineTool } from "@rsainth/chatdock-sdk";
import { z } from "zod";

export default defineTool({
  name: "search_customers",
  description: "Search customers the authenticated user is allowed to view.",
  inputSchema: z.object({
    query: z.string().trim().min(2).max(120),
  }),
  authorize: allOfToolAuthorizers(allowRoles(["admin", "support"]), allowTenant()),
  execute: async ({ input, context }) => {
    const customers = await context.services.customers.search(input.query, {
      user: context.user,
    });

    return {
      customers,
      count: customers.length,
    };
  },
});
```

For argument-aware authorization, add a declarative `policy` with roles, scopes, tenants, feature flags, and execute-time predicates. When a visible tool receives denied arguments, return or let the SDK produce a structured `toolDenied` result instead of throwing a server error.

Use `inputNormalizers` on a tool, or `toolInputNormalizers` on the handler, to coerce locale values like `06/2026`, `1.234,56`, `sim`, `nao`, and hallucinated IDs before authorization, rate limiting, final schema parsing, and `execute`.

Regenerate the tool file after adding, removing, or renaming tools:

```bash
npx chatdock-sdk sync-tools
```

The generated `chatbot/tools.generated.ts` file exports:

- `tools`: executable tool definitions for the backend route.
- `toolCatalog`: public metadata that can be used in prompts or diagnostics without exposing executors.

For larger agents, pass `detectIntent`, `toolsByIntent`, `runtimeConfigAdapter`,
and `resolveTools` to `createChatbotHandler` so each turn sends only the tools
available for the current intent, user, tenant settings, and message context.

## System Prompts

Use `defineSystemPrompt` to compose static text and dynamic request context. The helper accepts a string, a function, an array of parts, or `{ parts: [...] }`:

```ts
import { defineSystemPrompt } from "@rsainth/chatdock-sdk";

export const systemPrompt = defineSystemPrompt({
  parts: [
    "You are the internal assistant for this application.",
    "Answer clearly and do not invent private data.",
    "Use tools only when they are relevant and authorized.",
    ({ user, clientContext }) =>
      [
        `Authenticated user: ${user?.id ?? "anonymous"}`,
        `Current path: ${String(clientContext.pathname ?? "/")}`,
      ].join("\n"),
  ],
});
```

Dynamic prompt parts receive the same runtime context as tools, including the request, authenticated user, conversation id, client context, selected provider, trigger, and injected services.

## Persistence

Production apps should provide a `PersistenceAdapter`:

```ts
export const persistence = {
  async getOrCreateConversation(input) {
    // Find or create a conversation owned by input.user.
  },
  async loadMessages(input) {
    // Return prior UIMessage records for this conversation.
  },
  async saveMessage(input) {
    // Persist one user or assistant UIMessage.
  },
};
```

The handler calls persistence before and after streaming:

1. Create or load the conversation with `getOrCreateConversation`.
2. Load previous UI messages.
3. Save new user messages.
4. Stream the assistant response.
5. Save the final assistant message, or call `saveMessages` when the adapter provides it.

Keep chatbot persistence separate from business tables. Apply user ownership checks in persistence and business authorization checks inside tools.

## Model Selection

One of `model`, `models` with `defaultProvider`, or `fallbackModel` must be set on the backend route.

Pass one model:

```ts
createNextChatbotRoute({
  model: openai("gpt-4o-mini"),
});
```

Or expose multiple providers:

```ts
createNextChatbotRoute({
  defaultProvider: "fast",
  models: {
    fast: openai("gpt-4o-mini"),
    reasoning: openai("gpt-4.1"),
  },
});
```

The frontend can send a provider value through `ChatbotProvider`:

```tsx
<ChatbotProvider endpoint="/api/chat" provider="fast">
  {children}
</ChatbotProvider>
```

You can also pass a resolver function when model choice depends on the authenticated user, tenant, request context, or selected provider.

## CLI Commands

```bash
npx chatdock-sdk init
```

Creates starter chatbot files.

```bash
npx chatdock-sdk sync-tools
```

Discovers tools under `chatbot/tools/**/index.ts` and regenerates `chatbot/tools.generated.ts`.

```bash
npx chatdock-sdk doctor
```

Checks the expected project shape, generated files, dependency hints, tool metadata, and risky frontend imports.

## Exports

```ts
import { defineTool, createChatbotHandler } from "@rsainth/chatdock-sdk";
import { ChatbotProvider, ChatbotLauncher } from "@rsainth/chatdock-sdk/react";
import { createNextChatbotRoute } from "@rsainth/chatdock-sdk/next";
import { createSupabaseChatbotHandler } from "@rsainth/chatdock-sdk/supabase";
import "@rsainth/chatdock-sdk/styles.css";
```

Available subpaths:

- `@rsainth/chatdock-sdk`
- `@rsainth/chatdock-sdk/react`
- `@rsainth/chatdock-sdk/server`
- `@rsainth/chatdock-sdk/next`
- `@rsainth/chatdock-sdk/supabase`
- `@rsainth/chatdock-sdk/styles.css`
- `@rsainth/chatdock-sdk/supabase/schema.sql`

## Security Checklist

- Keep all tools on the server.
- Authenticate every chat request.
- Filter or authorize tools before execution.
- Validate tool input with `inputSchema`.
- Keep model API keys and service role keys out of frontend code.
- Use service role clients only for internal persistence and audit tables.
- Use authenticated user clients for business data when row-level security matters.
- Pass abort signals to external calls when possible.
- Add timeouts and output-size limits around slow or high-volume tools.
- Treat tool output as untrusted prompt content.
- Avoid exposing prompts, schemas, SQL, credentials, or hidden policies.
- Require explicit confirmation before destructive or externally visible side effects.
- Store audit events without secrets or sensitive full payloads.

## Package Development

For contributors working in this monorepo:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm release:check
```

Publishing is managed with Changesets:

```bash
pnpm release:version
pnpm release:check
pnpm release:publish
```
