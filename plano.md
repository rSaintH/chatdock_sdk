# Remaining Chatdock SDK Backlog

This file lists only what still needs to be implemented, in suggested execution order.

## Implementation Order

1. `P0.8` Debugging and tool-calling devtools.
   - `useChatbotDebugTrace` hook.
   - Optional trace persistence in a local or remote adapter.
   - Tool-calling debugging documentation.
   - Default redaction for sensitive payloads and headers.
2. `P0.9` Error, retry, and UX fallback strategy.
   - Dedicated, serializable `ChatbotError`.
   - `onRetry` and `onRecoverableError` callbacks.
   - Category-specific UX inside and outside the stream.
   - Retry without re-running destructive tools without fresh approval.
3. `P0.10` Remaining React components from the original plan.
   - Optional and safe markdown renderer.
   - More complete slots/classes for empty state, suggestions, and error.
   - Render tests for text parts, tool parts, empty state, suggestions, and error.
4. `P1.1` Internal Next/Supabase preset.
   - Opinionated `createInternalNextChatbot(...)` API.
   - Safe defaults for auth, tenant, and rate limit.
   - Explicit overrides for advanced apps.
5. `P1.2` Real human approval flow.
   - `ApprovalAdapter`.
   - `ToolApprovalRequest`, `ToolApprovalDecision`, and `ApprovalStatus` types.
   - React dialog with payload, approve, and cancel actions.
   - Backend revalidation before executing the tool.
   - Supabase persistence.
6. `P1.3` Rate limit and tenant isolation by default.
   - Mandatory tenant helpers and consistency across user, persistence, audit, usage, and RAG.
   - Basic rate-limit preset.
   - Tenant isolation guarantee for history and persistence.
   - Cross-tenant leakage tests.
7. `P1.5` Minimal observability for development.
   - Query adapter separated from the write adapter.
   - Event listing by conversation, user, tenant, tool, and time range.
   - Basic aggregates: tokens, cost, latency, and per-tool error.
   - Minimal dashboard example or query-UI docs.
8. `P1.6` Usage, costs, and budgets.
   - Budget-exceeded alerts and callbacks.
   - Doctor warning when internal routes do not record usage in production.
   - Pricing docs by provider and model.
9. `P1.7` Test helpers for tools and conversations.
   - `createMockToolContext({ user, tenant, services, clientContext })`.
   - `runToolTest(tool, { input, user, services })`.
   - `expectToolAuthorized` and `expectToolDenied`.
   - Conversation and tool-calling mock helper.
   - `expectToolCall(prompt, expected)` when practical.
10. `P1.8` Model routing, fallback, and response headers.
    - Richer `ModelResolver` response with auditable fallback.
    - Optional automatic fallback.
    - Audit of the selected provider and fallback usage.
    - Docs recommending AI Gateway for new Next apps.
11. `P1.9` Lifecycle hooks for complex real-world cases.
    - Typed hooks `routeMessage`, `beforeModelCall`, `handleDirectTool`, `prepareStep`, `compressHistory`.
    - Deterministic response without a model when applicable.
    - Auditable forced tool selection.
12. `P1.10` Validation in migrated real apps.
    - Migration guides for two internal reference applications.
    - Mapping of existing tools to the SDK convention.
    - Record of remaining app-specific gaps.
13. `P2.1` Official RAG ingestion pipeline.
    - Ingestion types and pipeline.
    - Simple chunker.
    - `EmbeddingAdapter`.
    - Document update and removal with old chunk cleanup.
    - Tenant, role, visibility, and metadata ACLs.
14. `P2.2` Runtime configuration per app and tenant.
    - `ChatbotRuntimeConfig`.
    - `RuntimeConfigAdapter`.
    - Loader with TTL cache and manual invalidation.
    - Resolver for enabled tools by config.
    - Resolver for provider and model by config.
15. `P2.3` Tool and prompt registry/versioning.
    - Hashes and versions for tools and prompts.
    - Optional `sync-tools` separate manifest write.
    - Comparison between local manifest and remote registry.

## Out Of The Remaining Plan

Delivered items were removed from this file so the backlog stays clean.
