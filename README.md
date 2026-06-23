# Chatdock SDK

An npm monorepo for embedding tool-calling chatbots in Vite apps, Next.js App Router apps, and Supabase Edge Functions.

The SDK separates reusable UI, a framework-agnostic backend core, runtime adapters, and a code generation CLI. The consuming app remains responsible for authentication, permissions, data, secrets, provider/model selection, and persistence.

## Packages

- `@rscheln/chatdock-sdk`: all-in-one package that installs and reexports the SDK modules.
- `@rscheln/react`: React components and hooks built on `@ai-sdk/react`.
- `@rscheln/server`: backend handler, tools, prompt builder, adapters, and types.
- `@rscheln/next`: adapter for Next.js App Router routes.
- `@rscheln/supabase`: adapter for Supabase Edge Functions.
- `@rscheln/cli`: `init`, `make-tool`, `sync-tools`, `watch-tools`, and `doctor`.

## All-in-one install

```bash
npm install @rscheln/chatdock-sdk
```

```ts
import { defineTool } from "@rscheln/chatdock-sdk";
import { ChatbotLauncher, ChatbotProvider } from "@rscheln/chatdock-sdk/react";
import { createNextChatbotRoute } from "@rscheln/chatdock-sdk/next";
import { createSupabaseChatbotHandler } from "@rscheln/chatdock-sdk/supabase";
```

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## Internal readiness

See `docs/internal-readiness.md` for the production-readiness checklist and the recommended integration path for internal applications.

For secure production setup, see:

- `docs/secure-setup.md`: complete auth, rate limit, Supabase, history, RAG and SQL policy guide.
- `docs/security.md`: security boundary and dangerous tool rules.
- `docs/persistence.md`: persistence contract and Supabase table guidance.
- `examples/next-basic/README.md`: concrete Next.js App Router file layout.
- `examples/vite-supabase/README.md`: concrete Vite + Supabase Edge Function file layout.

An optional internal control plane can manage runtime settings, usage, audit, and knowledge sources, while each consuming product keeps its own auth, business data access, RLS, and tools.

## Publishing

```bash
npm login
pnpm release:version
pnpm build
pnpm release:publish
```

Consumers can install the all-in-one package:

```bash
npm install @rscheln/chatdock-sdk
```

Or install only the packages they need:

```bash
npm install @rscheln/react @rscheln/server @rscheln/next @rscheln/supabase
npm install -D @rscheln/cli
```
