# Getting Started

The Chatdock SDK is designed for applications that keep authentication, business data, permissions and secrets in their own backend. The SDK provides reusable frontend components, backend handlers and conventions for tool calling.

## Install

Install the all-in-one package:

```bash
pnpm add @rscheln/chatdock-sdk
```

## Initialize

Run the CLI in the consuming application:

```bash
npx chatdock-sdk init
```

This creates the recommended `chatbot/` folder:

```txt
chatbot/
  auth.ts
  config.ts
  context.ts
  persistence.ts
  system-prompt.ts
  tools.generated.ts
  tools/
    example-tool/
      index.ts
```

The generated starter files are intentionally small. Replace the placeholder auth and persistence code with adapters that match your app.

For a Next.js App Router app that will use Supabase persistence, generate the opinionated scaffold:

```bash
npx chatdock-sdk init --next --supabase
```

This creates:

```txt
app/api/chat/route.ts
app/api/chat-history/[[...conversationId]]/route.ts
src/chatbot/
supabase/migrations/<timestamp>_ai_chatbot.sql
```

Use `--src-dir <path>` or `--app-dir <path>` if your project uses different folders.

## Add The React UI

Wrap your application shell:

```tsx
import { ChatbotLauncher, ChatbotProvider } from "@rscheln/chatdock-sdk/react";

export function AppShell() {
  return (
    <ChatbotProvider
      endpoint="/api/chat"
      getAuthToken={async () => session.access_token}
      context={() => ({
        pathname: window.location.pathname,
        search: window.location.search,
      })}
    >
      <App />
      <ChatbotLauncher />
    </ChatbotProvider>
  );
}
```

The frontend sends user messages and public request context only. It must not import server tools, service role keys, model API keys or persistence adapters.

## Add A Backend Route

Next.js App Router example:

```ts
import { createNextChatbotRoute } from "@rscheln/chatdock-sdk/next";
import { auth } from "@/chatbot/auth";
import { persistence } from "@/chatbot/persistence";
import { systemPrompt } from "@/chatbot/system-prompt";
import { tools } from "@/chatbot/tools.generated";

export const POST = createNextChatbotRoute({
  requireAuth: true,
  auth,
  persistence,
  systemPrompt,
  tools,
  maxRequestBytes: 256 * 1024,
  maxHistoryMessages: 40,
});
```

Supabase Edge Function example:

```ts
import { createSupabaseAuthAdapter, createSupabaseChatbotHandler } from "@rscheln/chatdock-sdk/supabase";
import { createClient } from "@supabase/supabase-js";
import { serve } from "https://deno.land/std/http/server.ts";
import { systemPrompt } from "../_shared/chatbot/system-prompt.ts";
import { tools } from "../_shared/chatbot/tools.generated.ts";

const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);

serve(createSupabaseChatbotHandler({
  requireAuth: true,
  auth: createSupabaseAuthAdapter({ client: userClient }),
  systemPrompt,
  tools,
}));
```

For production, add request rate limits, Supabase persistence/audit/usage adapters, and a separate history route. See `docs/secure-setup.md`.

## Sync Tools

Whenever you add, remove or rename a tool:

```bash
npx chatdock-sdk sync-tools
```

The command reads `chatbot/tools/**/index.ts`, validates basic metadata and regenerates `chatbot/tools.generated.ts`.

Create a new tool from a template:

```bash
npx chatdock-sdk make-tool get-clients
```

During local development, keep the generated registry in sync automatically:

```bash
npx chatdock-sdk sync-tools --watch
```

For projects generated with `--next --supabase`, the CLI automatically detects `src/chatbot`. You can also pass `--src-dir src` explicitly.

Example package scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "dev:chatbot": "chatdock-sdk sync-tools --watch",
    "dev:all": "turbo watch dev dev:chatbot"
  }
}
```

For Vite projects, run the same watch command alongside `vite dev`.

## Check The Project

```bash
npx chatdock-sdk doctor
```

`doctor` checks the project shape, expected dependencies, generated tool file, tool validation errors and risky frontend imports.
