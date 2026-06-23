# Tools

Tools are backend-only functions that the model can call after the backend has authenticated the user and filtered the available tool list.

## File Convention

Create one tool per folder:

```txt
chatbot/
  tools/
    get-clients/
      index.ts
```

The CLI discovers only files that match:

```txt
chatbot/tools/**/index.ts
```

Create a starter tool with:

```bash
npx chatdock-sdk make-tool get-clients
```

Useful flags:

```bash
npx chatdock-sdk make-tool disable-user --destructive --role admin --tenant
```

## Tool Shape

```ts
import { defineTool, toolOk } from "@rscheln/chatdock-sdk";
import { z } from "zod";

export default defineTool({
  name: "get_clients",
  description: "Finds clients the user is allowed to access.",
  input: z.object({
    query: z.string().trim().min(2).max(120),
  }),
  timeoutMs: 10_000,
  execute: async ({ input, context, signal }) => {
    const clients = await context.services.clients.search(input.query, { signal });

    return toolOk({
      data: { clients },
      rowCount: clients.length,
      display: `${clients.length} clients found.`,
    });
  },
});
```

`input` is a DX alias for `inputSchema`; existing tools can keep using `inputSchema`.

`execute` receives `{ input, context, options, signal }`. Pass `signal` to `fetch`, database drivers, or API clients that support `AbortSignal`.
Use `timeoutMs` on a tool to fail long-running work with a clear timeout error. A handler or registry can also provide `defaultToolTimeoutMs` for tools that do not set their own timeout.

Use `toolError` when a tool wants to return a structured, non-exception failure for the model to handle:

```ts
import { toolError } from "@rscheln/chatdock-sdk";

return toolError({
  message: "The CRM is temporarily unavailable.",
  code: "crm_unavailable",
  retryable: true,
});
```

Use `toolDenied` when the tool should tell the model that a visible tool cannot run for the submitted arguments:

```ts
import { toolDenied } from "@rscheln/chatdock-sdk";

return toolDenied({
  message: "The requested tenant is not available to this user.",
  code: "tenant_mismatch",
});
```

## Naming Rules

Tool names must be unique and use `snake_case`:

```txt
get_clients
list_pending_items
lookup_manual
```

Avoid names that expose internal database tables or implementation details.

## Codegen

Run:

```bash
npx chatdock-sdk sync-tools
```

During development:

```bash
npx chatdock-sdk sync-tools --watch
```

The CLI generates:

```ts
import tool1 from "./tools/get-clients";

export const tools = [
  tool1,
] as const;

export const toolCatalog = [
  {
    name: "get_clients",
    description: "Finds clients the user is allowed to access.",
    path: "./tools/get-clients",
  },
] as const;
```

The catalog is safe to use in prompts or admin diagnostics because it does not include `execute`.

## Validation

The initial CLI validates:

- default export exists
- required fields: `name`, `description`, `inputSchema`, `execute`
- `input` is accepted as a DX alias for `inputSchema`
- `name` is unique
- `name` is `snake_case`
- `description` is a string literal for catalog generation

It does not execute tool code during discovery.

## Permissions And Dangerous Tools

Tools may declare permission metadata:

```ts
permissions: [
  { type: "role", anyOf: ["admin", "supervision"] },
],
```

Tools that change data should also declare:

```ts
destructive: true,
```

`dangerous: true` is accepted as a compatibility alias and is normalized to `destructive: true`.
Use `requiresConfirmation: true` for tools that must be approved before execution.

The backend must filter tools before sending them to the model. The model must never receive tools the authenticated user cannot use.
Destructive, dangerous, or confirmation-required tools are blocked by default unless the request context includes explicit approval through `humanApproved: true` or `approvedToolNames: ["tool_name"]`.

Use authorizers for enforceable checks:

```ts
import {
  allowRoles,
  allowTenant,
  allOfToolAuthorizers,
  denyDestructiveInDemo,
  requireHumanApproval,
} from "@rscheln/chatdock-sdk";

export default defineTool({
  name: "sync_runtime",
  description: "Synchronizes runtime settings for an allowed tenant.",
  inputSchema,
  destructive: true,
  authorize: allOfToolAuthorizers(
    allowRoles(["admin"]),
    allowTenant(),
    requireHumanApproval(),
    denyDestructiveInDemo(),
  ),
  execute,
});
```

Destructive tools should also be protected by a handler-level `toolExecutionRateLimitAdapter`; request rate limits alone are not enough.

Declarative permissions are supported for common role, scope, and tenant checks:

```ts
export default defineTool({
  name: "get_clients",
  description: "Finds clients the user is allowed to access.",
  input: inputSchema,
  permissions: [
    { type: "role", anyOf: ["admin", "supervision"] },
    { type: "scope", allOf: ["clients:read"] },
    { type: "tenant", required: true },
  ],
  execute,
});
```

Use `policy` when a tool needs the same checks plus feature flags or argument-aware predicates. Predicate checks run during execution, after the model has supplied tool input, so the tool can remain visible while specific arguments are denied cleanly.

```ts
export default defineTool({
  name: "get_client_report",
  description: "Gets a client report when the user can access the requested tenant.",
  input: inputSchema,
  policy: {
    roles: { anyOf: ["admin", "support"] },
    scopes: { allOf: ["reports:read"] },
    tenants: { required: true },
    featureFlags: ["reports_tool"],
    predicates: [
      {
        name: "same tenant",
        code: "tenant_mismatch",
        reason: "The requested tenant is not available to this user.",
        when: ({ context, input }) => context.user?.tenantId === input.tenantId,
      },
    ],
  },
  execute,
});
```

Audit adapters can distinguish tools removed before model exposure (`tool.filtered`) from visible tools denied at execution time (`tool.denied`) and tools that failed while running (`tool.failed`).

## Suites And Manifest

Use `createToolSuite` to apply shared defaults and catch duplicate tool names:

```ts
import { createToolSuite } from "@rscheln/chatdock-sdk";
import getClients from "./tools/get-clients";

export const suite = createToolSuite({
  appId: "portal",
  defaults: {
    metadata: { app: "portal" },
  },
  tools: [getClients],
});

export const tools = suite.tools;
```

Use `createToolManifest` for safe diagnostics or prompt metadata. It includes names, descriptions, and public metadata, but never includes `execute`.

## Dynamic Tool Routing

Use dynamic routing when the app has many tools and each turn should expose only
the tools that make sense for the detected intent, tenant config, and current
user context.

```ts
import { createChatbotHandler } from "@rscheln/chatdock-sdk";
import { tools } from "./tools.generated";

export const handler = createChatbotHandler({
  model,
  tools,
  toolsByIntent: {
    clients: ["search_clients", "get_client"],
    docs: ["search_knowledge"],
  },
  detectIntent: async ({ message }) => {
    const text = message?.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join(" ")
      .toLowerCase();

    return text?.includes("manual") ? "docs" : "clients";
  },
  runtimeConfigAdapter: {
    get: async ({ context }) => ({
      tools: context.user?.roles?.includes("admin")
        ? ["search_clients", "get_client", "search_knowledge"]
        : ["search_clients", "search_knowledge"],
    }),
  },
  resolveTools: async ({ tools, intent, settings, context }) => ({
    tools: tools.filter((tool) => {
      if (intent === "clients" && context.clientContext.readOnly === true) {
        return tool.name !== "get_client";
      }
      return settings?.disabledToolNames?.includes(tool.name) !== true;
    }),
  }),
});
```

Routing is applied after built-in authorization and before UI message validation,
debug snapshots, and the model call. A `resolveTools` hook can reduce or reorder
the current list, but it cannot reintroduce a tool that was already filtered out
by authorization, intent, or runtime config.

When dynamic routing is configured, the handler also re-runs routing from the AI
SDK `prepareStep` hook and sends the step-specific list through `activeTools`.

The handler emits a `tools.resolved` audit event with `intent_detected`,
`tools_total`, `tools_sent`, and `tools_unavailable` so production routes can
track which tools were sent to the provider.

## Knowledge Tool

Use `createKnowledgeTool` when the model needs retrieval from approved documents:

```ts
import { createKnowledgeTool, allowTenant } from "@rscheln/chatdock-sdk";

export const searchKnowledge = createKnowledgeTool(knowledgeAdapter, {
  name: "search_knowledge",
  description: "Searches approved knowledge sources and returns cited passages.",
  maxLimit: 8,
  filters: ({ context }) => ({
    tenantId: context.user?.tenantId,
    visibility: "internal",
  }),
  authorize: allowTenant(),
});
```

The consuming app owns ingestion, embeddings, ACLs, and the search adapter. The adapter must tenant-filter before returning chunks and should include source citations.
