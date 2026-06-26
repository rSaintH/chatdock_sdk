# Secure Setup

This guide is the recommended production baseline for an app that embeds the SDK. It covers the pieces that are required before enabling internal users, tenant data, destructive tools, Supabase persistence, remote history, or a knowledge/RAG tool.

The SDK owns the chat transport, handlers, prompt/tool conventions, persistence contract, common auth hooks, audit hooks and optional Supabase adapters. The consuming app owns authentication, authorization, business queries, RLS, secrets, provider selection and deployment.

## Route Baseline

Require authentication on every internal chat route:

```ts
import { openai } from "@ai-sdk/openai";
import { createNextChatbotRoute, createHeaderAuthAdapter } from "@rsainth/chatdock-sdk/next";
import {
  createSupabaseAuditAdapter,
  createSupabasePersistence,
  createSupabaseRateLimitAdapter,
  createSupabaseUsageAdapter,
} from "@rsainth/chatdock-sdk/supabase";
import { adminClient } from "@/lib/supabase-admin";
import { tools } from "@/chatbot/tools.generated";
import { systemPrompt } from "@/chatbot/system-prompt";

export const POST = createNextChatbotRoute({
  requireAuth: true,
  model: openai("gpt-4o-mini"),
  authAdapter: createHeaderAuthAdapter(async ({ token }) => {
    const user = await resolveUserFromBearerToken(token);
    if (!user) return null;
    return {
      id: user.id,
      roles: user.roles,
      tenantId: user.tenantId,
      metadata: { email: user.email },
    };
  }),
  persistence: createSupabasePersistence({
    adminClient,
    requireTenant: true,
  }),
  rateLimitAdapter: createSupabaseRateLimitAdapter({
    adminClient,
    keyPrefix: "product-chat",
    rules: [
      {
        name: "messages_per_user_minute",
        limit: 20,
        windowSeconds: 60,
      },
      {
        name: "messages_per_tenant_hour",
        limit: 1000,
        windowSeconds: 60 * 60,
        key: ({ user }) => user?.tenantId ? `tenant:${user.tenantId}` : null,
      },
    ],
  }),
  auditAdapter: createSupabaseAuditAdapter(adminClient),
  usageAdapter: createSupabaseUsageAdapter({ adminClient }),
  systemPrompt,
  tools,
});
```

`requireAuth: true` must be paired with an auth adapter. Unauthenticated requests return `401` before persistence, rate limits, model calls or tool execution.
Every production route must also set `model`, `models` with `defaultProvider`, or `fallbackModel`.

## Request Rate Limits

Use request rate limits for chat traffic and model spend. Good defaults for internal apps are:

- per user per minute, to stop accidental loops;
- per user per hour, to cap normal usage;
- per tenant per hour, to protect shared spend;
- stricter limits for anonymous/public demos, if enabled.

Supabase projects can use `createSupabaseRateLimitAdapter`, which calls the `ai_check_rate_limit` RPC from the SDK schema.

## Destructive Tool Limits

Request limits and tool execution limits are separate. A user can send few messages that trigger expensive or destructive tools repeatedly, so destructive tools need their own checks.

Mark side-effecting tools explicitly:

```ts
import { defineTool, allowRoles, allOfToolAuthorizers, requireHumanApproval } from "@rsainth/chatdock-sdk";

export default defineTool({
  name: "disable_user",
  description: "Disables a user account after explicit approval.",
  inputSchema,
  destructive: true,
  authorize: allOfToolAuthorizers(
    allowRoles(["admin"]),
    requireHumanApproval(),
  ),
  execute: async ({ input, context }) => {
    return context.services.identity.disableUser(input.userId);
  },
});
```

If the app enables destructive tools, provide `toolExecutionRateLimitAdapter` on the handler. The SDK calls it for each tool execution after authorization and before `execute`.

```ts
const destructiveToolLimiter = {
  async check({ tool, context }) {
    if (!tool.destructive) return { allowed: true };

    const allowed = await consumeDestructiveQuota({
      tenantId: context.user?.tenantId,
      userId: context.user?.id,
      toolName: tool.name,
      limit: 5,
      windowSeconds: 60 * 60,
    });

    return allowed
      ? { allowed: true }
      : {
          allowed: false,
          reason: "Destructive tool quota exceeded.",
          retryAfter: 60 * 60,
        };
  },
};
```

The app can back this adapter with Supabase, Redis, its existing audit system, or a product-specific approval workflow.

## Supabase Usage

Use two clients:

- user client: created from the browser token, used for product queries that should honor RLS;
- admin client: service role client used only inside backend routes/functions for `ai_*` persistence, audit, usage and rate-limit tables.

Do not pass the service role client into generic business tools. If a tool must use elevated access, keep it small, reviewed, role-gated, tenant-scoped and audited.

Required backend environment:

```txt
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
```

For Supabase Edge Functions, authenticate with `createSupabaseAuthAdapter` and persist with `createSupabasePersistence`:

```ts
import { openai } from "@ai-sdk/openai";
import {
  createSupabaseAuthAdapter,
  createSupabaseChatbotHandler,
  createSupabasePersistence,
  createSupabaseRateLimitAdapter,
} from "@rsainth/chatdock-sdk/supabase";

Deno.serve(createSupabaseChatbotHandler({
  requireAuth: true,
  model: openai("gpt-4o-mini"),
  auth: createSupabaseAuthAdapter({ client: userClient }),
  persistence: createSupabasePersistence({
    adminClient,
    requireTenant: true,
  }),
  rateLimitAdapter: createSupabaseRateLimitAdapter({
    adminClient,
    keyPrefix: "internal-chat",
  }),
  systemPrompt,
  tools,
}));
```

## History Endpoint

Expose remote history from a separate authenticated backend route. The server helper supports:

- `GET /api/chat/history?limit=50`: list conversations;
- `GET /api/chat/history?search=term`: search conversations;
- `GET /api/chat/history/:id`: load one conversation with messages;
- `PATCH /api/chat/history/:id`: rename/update title;
- `DELETE /api/chat/history/:id`: delete one conversation.

Next.js route shape:

```ts
import { createConversationHistoryHandler } from "@rsainth/chatdock-sdk";
import { auth } from "@/chatbot/auth";
import { persistence } from "@/chatbot/persistence";

const handler = createConversationHistoryHandler({
  authAdapter: auth,
  persistence,
  basePath: "/api/chat/history",
});

export { handler as GET, handler as PATCH, handler as DELETE };
```

React can wire history with the exported remote history hook. Keep `ChatbotProvider` configured with the same auth token source, then point `useChatbotConversations` at the history endpoint:

```tsx
import { useChatbotConversations } from "@rsainth/chatdock-sdk/react";

function RemoteHistoryList() {
  const history = useChatbotConversations({
    endpoint: "/api/chat/history",
    mode: "remote",
  });

  return history.conversations.map((item) => (
    <button
      key={item.id}
      type="button"
      onClick={() => void history.selectConversation(item.id)}
    >
      {item.title ?? "Untitled conversation"}
    </button>
  ));
}
```

The hook reuses `ChatbotProvider` auth/header callbacks by default, falls back to localStorage in `auto` mode, and hydrates loaded `UIMessage[]` into the active chat controller when a conversation is selected.

If you want the full history surface instead of wiring the list by hand, the React package also exports `ChatbotHistoryPanel`:

```tsx
import { ChatbotHistoryPanel } from "@rsainth/chatdock-sdk/react";

function HistorySidebar() {
  return (
    <ChatbotHistoryPanel
      endpoint="/api/chat/history"
      mode="remote"
      fallbackToLocalStorage={false}
    />
  );
}
```

The packaged panel handles list, search, open, rename and delete interactions while keeping the same remote or local fallback behavior as `useChatbotConversations`.

## RAG And Knowledge Adapter

Knowledge search is a tool like any other. The SDK provides `createKnowledgeTool` and a Supabase/pgvector adapter. The app still owns ingestion, embedding model choice, document ACLs, and connector sync.

```ts
import { createKnowledgeTool, allowTenant } from "@rsainth/chatdock-sdk";
import { createSupabaseKnowledgeAdapter } from "@rsainth/chatdock-sdk/supabase";

const knowledgeAdapter = createSupabaseKnowledgeAdapter({
  adminClient,
  requireTenant: true,
  queryEmbedding: async ({ query, services }) => {
    return services.embeddings.embed(query);
  },
});

export const searchKnowledge = createKnowledgeTool(
  knowledgeAdapter,
  {
    name: "search_knowledge",
    description: "Searches approved product knowledge and returns cited passages.",
    maxLimit: 8,
    filters: ({ context }) => ({
      tenantId: context.user?.tenantId,
      visibility: "internal",
    }),
    authorize: allowTenant(),
  },
);
```

Adapter rules:

- filter by tenant before returning chunks;
- return only approved sources for the current user/role;
- include citation metadata: source id, document id, title, URI and score;
- cap result count and chunk size;
- treat retrieved text as untrusted model context;
- keep ingestion, embedding model choice and document ACLs in the consuming app or in an optional internal control plane.

An optional internal control plane can own source management, ingestion status, document approval, embedding settings and connector sync. Product backends should still enforce tenant and role filters at search time.

## Supabase Policies SQL

The SDK schema enables RLS on `ai_*` tables and includes baseline policies for service-role backend access plus authenticated owner/tenant reads and writes where appropriate. This assumes the authenticated JWT carries the expected user id and tenant claim.

For stricter backend-only access, remove or override direct `authenticated` table access and expose history through authenticated routes instead.

Deny-by-default posture:

```sql
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_tool_audit enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_rate_limits enable row level security;
alter table public.ai_settings enable row level security;

revoke all on public.ai_conversations from anon, authenticated;
revoke all on public.ai_messages from anon, authenticated;
revoke all on public.ai_tool_audit from anon, authenticated;
revoke all on public.ai_usage_events from anon, authenticated;
revoke all on public.ai_rate_limits from anon, authenticated;
revoke all on public.ai_settings from anon, authenticated;
```

If a product intentionally reads conversation history directly from Supabase on the client, add narrow policies instead of using the deny-only posture. Example with a `tenant_id` JWT claim:

```sql
create policy "ai_conversations_select_own_tenant"
on public.ai_conversations
for select
to authenticated
using (
  user_id = auth.uid()::text
  and tenant_id = coalesce(auth.jwt() ->> 'tenant_id', 'default')
);

create policy "ai_messages_select_own_tenant"
on public.ai_messages
for select
to authenticated
using (
  user_id = auth.uid()::text
  and tenant_id = coalesce(auth.jwt() ->> 'tenant_id', 'default')
);
```

Do not expose audit, usage, rate-limit or settings tables directly to the browser unless the product has a specific admin UI with separate role policies.

Admin-only settings example:

```sql
create policy "ai_settings_select_admin"
on public.ai_settings
for select
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' -> 'roles', '[]'::jsonb) ? 'admin'
);
```

Keep product business policies separate from SDK persistence policies.

## Optional Control Plane

Use an optional internal control plane:

- publish enabled tools and prompt settings per product/tenant;
- review audit and usage events;
- manage knowledge sources and ingestion status;
- synchronize runtime settings into products;
- keep destructive actions behind product-owned approval and authorization.

Do not make product chat routes depend on control-plane availability for basic request handling. Cache or snapshot runtime settings so chat can fail closed for tools/settings while still returning a clear error to the user.
