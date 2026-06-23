# Post-Review SDK Implementation Plan

This document lists only the remaining work. Delivered items were removed so the plan functions as a real backlog.

## Goal

Complete the SDK as an opinionated internal kit for assistants with tools in Next.js/Supabase systems, with security, history, audit, debug, RAG, costs, and governance.

## Execution Order

1. P0: make it adoptable internally.
2. P1: make it safe for production.
3. P2: make it a platform.

Each slice must finish with:

- `corepack pnpm -r --if-present typecheck`
- `corepack pnpm -r --if-present test`
- updated docs
- an example or fixture covering the new flow

## P0 - Make It Adoptable Internally

### P0.6 - Security-focused `doctor`

Goal: turn `doctor` into an opinionated check for real risks.

Pending:

- Inspect routes and handlers to detect missing `requireAuth`.
- Warn about exposed service roles or misuse in business tools.
- Warn when persistence, history, or tools are not tenant-scoped.
- Warn when rate limits are missing.
- Warn about unprotected internal routes.
- Classify severity as `info`, `warn`, or `error`.
- Real scaffold fixture running `doctor` right after `init`.

Acceptance criteria:

- `doctor` points to concrete problems, not just missing files.
- The output is actionable and severity-based.

### P0.7 - Tool watch mode

Goal: remove the manual step of synchronizing tools during development.

Pending:

- Real watch mode for `sync-tools`.
- Debounce for several file saves in sequence.
- Recovery after errors without stopping the watch.
- `--dry-run --watch` showing a diff without writing.
- Natural integration with `next dev` and `turbo watch`.
- Tests with a temporary filesystem.

Acceptance criteria:

- Creating, removing, or renaming tools updates the registry automatically.
- The watch continues after errors or invalid saves.

### P0.8 - Debugging and tool-calling devtools

Goal: make it possible to inspect what the model received and what tools did.

Pending:

- `useChatbotDebugTrace` hook.
- Optional trace persistence in a local or remote adapter.
- Recipe documentation for tool-calling debugging.
- Default redaction for sensitive payloads and headers.
- Fixture covering both successful and failing tool flows.

Acceptance criteria:

- Debugging is opt-in.
- Secrets do not appear in the trace.

### P0.9 - Error, retry, and UX fallback strategy

Goal: clearly distinguish model, tool, timeout, rate-limit, auth, and network failures.

Pending:

- Dedicated, serializable `ChatbotError`.
- `onRetry` and `onRecoverableError` callbacks.
- Complete UX by category inside and outside the stream.
- Retry without re-running a destructive tool without fresh approval.
- Tests for the main categories.

Acceptance criteria:

- The message shown to the user is friendly.
- Technical details stay in audit/debug.

### P0.10 - Remaining React components from the original plan

Goal: complete the React layer without losing headless usage.

Pending:

- Optional safe markdown renderer without `dangerouslySetInnerHTML`.
- More complete slots/classes for empty state, suggestions, and error.
- Render tests for text parts, tool parts, empty state, suggestions, and error.

Acceptance criteria:

- The package still works headlessly.
- Markdown remains optional.

## P1 - Make It Safe For Production

### P1.1 - Internal Next/Supabase preset

Goal: reduce repeated and risky configuration in internal apps.

Pending:

- Opinionated `createInternalNextChatbot(...)` API.
- Safe defaults for auth, tenant, and rate limit.
- Explicit overrides for advanced apps.
- Documentation covering what the preset does and what remains the app's responsibility.

### P1.2 - Real human approval flow

Goal: approve destructive tools in a visible, auditable, and expiring way.

Pending:

- `ApprovalAdapter`.
- `ToolApprovalRequest`, `ToolApprovalDecision`, and `ApprovalStatus` types.
- React dialog with payload, approve, and cancel actions.
- Backend revalidation before executing the tool.
- Supabase persistence.
- Audit events for requested, approved, denied, expired, and executed.

### P1.3 - Rate limit and tenant isolation by default

Goal: avoid every app having to remember the same protections.

Pending:

- Mandatory tenant helpers and consistency across user, persistence, audit, usage, and RAG.
- Basic rate-limit preset.
- Tenant isolation guarantee for history and persistence.
- Cross-tenant leakage tests.

### P1.4 - Tool and handler hardening

Goal: close the remaining operational protections.

Pending:

- `outputSchema` output validation.
- Configurable tool output truncation or summarization.
- Specific audit events for timeout and truncated output.

### P1.5 - Minimal observability for development

Goal: make audit and usage easy to query in day-to-day work.

Pending:

- Query adapter separated from the write adapter.
- Event listing by conversation, user, tenant, tool, and time range.
- Basic aggregates: tokens, cost, latency, and per-tool error.
- Minimal dashboard example or query-UI docs.

### P1.6 - Usage, costs, and budgets

Goal: provide visibility and control over spend by app, conversation, user, and tenant.

Pending:

- Budget-exceeded alerts and callbacks.
- Doctor warning when internal routes do not record usage in production.
- Pricing docs by provider/model as the app or control-plane responsibility.

### P1.7 - Test helpers for tools and conversations

Goal: test tools and flows without a real model.

Pending:

- `createMockToolContext({ user, tenant, services, clientContext })`.
- `runToolTest(tool, { input, user, services })`.
- `expectToolAuthorized` and `expectToolDenied`.
- Conversation and tool-calling mock helper.
- `expectToolCall(prompt, expected)` when practical.
- Fixtures for safe tenant handling and cross-tenant leakage attempts.

### P1.8 - Model routing, fallback, and response headers

Goal: complete the provider/model strategy.

Pending:

- Richer `ModelResolver` response with auditable fallback.
- Optional automatic fallback.
- Audit of the selected provider and fallback usage.
- `x-provider` and `x-model` headers when known.
- Docs recommending AI Gateway for new Next apps.

### P1.9 - Lifecycle hooks for complex real-world cases

Goal: cover special cases without filling the handler with conditionals.

Pending:

- Typed hooks `routeMessage`, `beforeModelCall`, `handleDirectTool`, `prepareStep`, `compressHistory`.
- Deterministic response without a model when applicable.
- Auditable forced tool selection.
- Documentation on when to use a hook versus a normal tool.

### P1.10 - Validation in migrated real apps

Goal: make sure the roadmap works in the systems that motivated the SDK.

Pending:

- Migration guides for two internal reference applications.
- Mapping of existing tools to the SDK convention.
- Record of remaining app-specific gaps.

## P2 - Make It A Platform

### P2.1 - Official RAG ingestion pipeline

Goal: cover the boring work of documents, chunks, embeddings, and ACLs.

Pending:

- Ingestion types and pipeline.
- Simple chunker.
- `EmbeddingAdapter`.
- Document update and removal with old chunk cleanup.
- Tenant, role, visibility, and metadata ACLs.
- Optional local ingestion CLI.

### P2.2 - Runtime configuration per app and tenant

Goal: enable or disable tools, switch models, and adjust limits without redeploying.

Pending:

- `ChatbotRuntimeConfig`.
- `RuntimeConfigAdapter`.
- Loader with TTL cache and manual invalidation.
- Resolver for enabled tools by config.
- Resolver for provider and model by config.
- Example Supabase config schema.

### P2.3 - Tool and prompt registry/versioning

Goal: enable governance and change diagnosis.

Pending:

- Hashes and versions for tools and prompts.
- Optional `sync-tools` separate manifest write.
- Comparison between local manifest and remote registry.
