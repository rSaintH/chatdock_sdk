# Next Basic

Minimal runnable Next.js App Router example for `@rscheln/chatdock-sdk`.

It includes:

- `app/api/chat/route.ts` using `createNextChatbotRoute`;
- `app/api/chat-history/[[...conversationId]]/route.ts` using the SDK history handler;
- `app/page.tsx` and `app/layout.tsx` with `ChatbotProvider` and `ChatbotLauncher`;
- `src/chatbot/*` with demo auth, in-memory persistence, system prompt, generated tools, and one tool;
- a local mock model, so no provider key is required for typecheck or local smoke testing.

## Setup

1. From the repository root, install dependencies:

   ```bash
   corepack pnpm install
   ```

2. Typecheck this example:

   ```bash
   corepack pnpm --filter @rscheln/example-next-basic typecheck
   ```

3. Run it locally:

   ```bash
   corepack pnpm --filter @rscheln/example-next-basic dev
   ```

4. Open the printed Next.js URL and use the launcher in the bottom corner.

5. Ask "What is my current status?" to exercise the local chat route. The demo auth token is supplied by `app/shell.tsx`.

## Replacing the Local Model

The default model in `src/chatbot/local-model.ts` is deterministic and does not call any external service. For production, replace `localModel` in `app/api/chat/route.ts` with an AI SDK provider model, for example:

```ts
import { openai } from "@ai-sdk/openai";

model: openai("gpt-4o-mini");
```

Then install the provider package and set the required server-side environment variables. Keep provider keys out of client components.

## Production Notes

- Replace `src/chatbot/auth.ts` with your real session or JWT validation.
- Replace `src/chatbot/persistence.ts` with a durable adapter before deploying.
- Keep `requireAuth: true` on chat and history routes.
- Run `chatdock-sdk sync-tools` after adding or moving tools so `tools.generated.ts` stays explicit.
