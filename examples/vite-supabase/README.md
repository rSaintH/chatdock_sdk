# Vite Supabase

Example target for validating a Vite frontend with a Supabase Edge Function backend.

This folder is intentionally a concrete file guide, not a full generated app.

## Install

```bash
pnpm add @rsainth/chatdock-sdk @supabase/supabase-js @ai-sdk/openai ai zod
```

## Files

```txt
src/
  App.tsx
  chatbot/
    ChatbotShell.tsx
  lib/
    supabase.ts
supabase/
  functions/
    ai-chat/
      index.ts
    ai-chat-history/
      index.ts
    _shared/
      chatbot/
        system-prompt.ts
        tools.generated.ts
        tools/
          get-profile/
            index.ts
```

## `src/lib/supabase.ts`

```ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
```

## `src/chatbot/ChatbotShell.tsx`

```tsx
import "@rsainth/chatdock-sdk/styles.css";
import { ChatbotLauncher, ChatbotProvider } from "@rsainth/chatdock-sdk/react";
import type { ReactNode } from "react";
import { supabase } from "../lib/supabase";

async function getAuthToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function ChatbotShell({ children }: { children: ReactNode }) {
  return (
    <ChatbotProvider
      endpoint={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`}
      getAuthToken={getAuthToken}
      context={() => ({
        app: "vite-supabase",
        pathname: window.location.pathname,
      })}
      initialSuggestions={[
        "Show my profile",
        "What can you help with?",
      ]}
    >
      {children}
      <ChatbotLauncher />
    </ChatbotProvider>
  );
}
```

## `supabase/functions/ai-chat/index.ts`

```ts
import { openai } from "npm:@ai-sdk/openai";
import { createClient } from "npm:@supabase/supabase-js";
import {
  createSupabaseAuditAdapter,
  createSupabaseAuthAdapter,
  createSupabaseChatbotHandler,
  createSupabasePersistence,
  createSupabaseRateLimitAdapter,
  createSupabaseUsageAdapter,
} from "npm:@rsainth/chatdock-sdk/supabase";
import { systemPrompt } from "../_shared/chatbot/system-prompt.ts";
import { tools } from "../_shared/chatbot/tools.generated.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const userClient = createClient(supabaseUrl, anonKey);
const adminClient = createClient(supabaseUrl, serviceRoleKey);

function readRoles(value: unknown) {
  return Array.isArray(value)
    ? value.filter((role): role is string => typeof role === "string")
    : [];
}

Deno.serve(createSupabaseChatbotHandler({
  requireAuth: true,
  model: openai("gpt-4o-mini"),
  auth: createSupabaseAuthAdapter({
    client: userClient,
    mapUser: (user) => ({
      id: user.id,
      roles: readRoles(user.user_metadata?.roles),
      tenantId: String(user.user_metadata?.tenant_id ?? "default"),
      metadata: { email: user.email },
    }),
  }),
  persistence: createSupabasePersistence({
    adminClient,
    requireTenant: true,
  }),
  rateLimitAdapter: createSupabaseRateLimitAdapter({
    adminClient,
    keyPrefix: "vite-supabase",
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
}));
```

## `supabase/functions/ai-chat-history/index.ts`

```ts
import { createClient } from "npm:@supabase/supabase-js";
import { createConversationHistoryHandler } from "npm:@rsainth/chatdock-sdk";
import {
  createSupabaseAuthAdapter,
  createSupabasePersistence,
} from "npm:@rsainth/chatdock-sdk/supabase";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const userClient = createClient(supabaseUrl, anonKey);
const adminClient = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(createConversationHistoryHandler({
  authAdapter: createSupabaseAuthAdapter({ client: userClient }),
  persistence: createSupabasePersistence({
    adminClient,
    requireTenant: true,
  }),
}));
```

## `supabase/functions/_shared/chatbot/tools/get-profile/index.ts`

```ts
import { defineTool, allowTenant } from "npm:@rsainth/chatdock-sdk";
import { z } from "npm:zod";

export default defineTool({
  name: "get_profile",
  description: "Returns the authenticated user's chat profile.",
  inputSchema: z.object({}),
  authorize: allowTenant(),
  execute: async ({ context }) => ({
    data: {
      id: context.user?.id,
      tenantId: context.user?.tenantId,
      roles: context.user?.roles ?? [],
    },
  }),
});
```

Run tool generation from the folder that contains the shared `chatbot/tools` directory:

```bash
npx chatdock-sdk sync-tools
```

## Supabase SQL

Apply the SDK schema for `ai_conversations`, `ai_messages`, `ai_tool_audit`, `ai_usage_events`, `ai_rate_limits`, `ai_settings` and `ai_check_rate_limit`.

Keep those tables backend-only by default:

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

If the frontend reads history directly from Supabase, add narrow user/tenant policies instead. Prefer the `ai-chat-history` function for most apps.

Production checklist:

- set `SUPABASE_SERVICE_ROLE_KEY` only as a function secret;
- keep `VITE_SUPABASE_ANON_KEY` public and browser-safe;
- use `requireAuth: true`;
- use request rate limits and destructive tool limits;
- use service role only for `ai_*` persistence/audit/usage/rate-limit tables;
- keep business data access in tenant-scoped tools that preserve product authorization.
