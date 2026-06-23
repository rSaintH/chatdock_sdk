# Security

The SDK assumes the consuming backend is the authority for authentication, authorization, auditing and side effects.

## Required Rules

- Tools run only on the server.
- The frontend never receives model API keys, service role keys or tool executors.
- Authenticate every chat request.
- Use `requireAuth: true` on internal routes.
- Rate-limit chat requests before model calls.
- Rate-limit destructive tool execution separately from request traffic.
- Filter tools before sending them to the model.
- Validate tool input with `inputSchema`.
- Pass `AbortSignal` to external calls when possible.
- Enforce a timeout per tool.
- Limit request body size and message history size.
- Limit tool output size.
- Treat tool output as untrusted data in the prompt.
- Mask sensitive fields in audit logs.
- Do not reveal prompts, hidden policies, schemas, SQL or credentials.
- Do not execute destructive actions without explicit confirmation.

Set `timeoutMs` on each tool, or `defaultToolTimeoutMs` on the handler as a fallback. The SDK passes `signal` into `execute`, aborts it on timeout or upstream cancellation, and fails timed-out tools with a clear error instead of waiting indefinitely.

## Frontend Boundary

Frontend code may import:

```ts
@rscheln/react
```

Frontend code must not import:

```ts
@rscheln/server
@rscheln/next
@rscheln/supabase
```

It also must not reference service role keys or provider API keys.

## Supabase Boundary

Use two clients when needed:

- user client for business queries that should preserve RLS
- admin client for internal persistence and audit tables only

The admin client must not be passed into generic tools unless the tool is explicitly internal and tightly reviewed.

The recommended Supabase posture is backend-only access to `ai_*` tables. Enable RLS, avoid broad browser policies, and expose conversation history through authenticated backend routes. If a product intentionally reads history directly from the browser, add narrow `user_id` and `tenant_id` policies. See `docs/secure-setup.md`.

## Dangerous Tools

Any tool that changes data, sends messages, charges money, exports private data or triggers external side effects should declare:

```ts
destructive: true,
```

`dangerous: true` is accepted as a compatibility alias. Use `requiresConfirmation: true`, `requireHumanApproval()` or a product-owned approval authorizer for tools that need explicit confirmation.

The registry blocks destructive, dangerous and confirmation-required tools by default unless the request context includes `humanApproved: true` or `approvedToolNames: ["tool_name"]`.

Destructive tools should also have a tool execution quota. A request rate limit protects chat traffic; it does not prevent one allowed request from triggering repeated high-risk tool calls.

## Auditing

Audit events should record enough information to investigate behavior without storing secrets:

- user id
- conversation id
- tool name
- timestamps
- result status
- reduced input metadata
- reduced output metadata

Audit failures should be logged but should not crash the chat response.

## Complete Setup

See `docs/secure-setup.md` for concrete snippets covering:

- `requireAuth`;
- request rate limits;
- destructive tool limits;
- Supabase persistence, audit and usage;
- history endpoint and React remote history wiring;
- RAG/knowledge adapter setup;
- RLS and policy SQL.
