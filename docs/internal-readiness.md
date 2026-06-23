# Internal Readiness

This document tracks what the SDK needs before it can be reused comfortably across internal applications.

## Current Baseline

The SDK already provides the reusable foundation:

- React UI primitives and hooks.
- Next.js and Supabase backend adapters.
- Server-side tool definitions.
- Per-tool authorization hooks.
- Persistence adapter contract.
- Tool audit adapter.
- CLI scaffolding and tool discovery.

The serious internal baseline requires stricter defaults around authentication, tenant isolation, rate limits, and operational visibility.

## Review Coverage

| Area | Status | Notes |
| --- | --- | --- |
| `requireAuth` | Covered | `requireAuth: true` returns `401` before persistence, model calls, or tools. |
| Request rate limit | Covered | Supabase fixed-window adapter covers message and request limits per user, tenant, or custom key. |
| Destructive tool rate limit | Covered by contract | `toolExecutionRateLimitAdapter` runs per tool execution; each app still chooses the backing quota store and policy. |
| Tool permission helpers | Covered | Role, tenant, approval, demo-safe, and composed authorizers are available. |
| Multi-tenant persistence | Covered for Supabase | `tenant_id` is modeled and used in persistence filters. |
| Supabase production schema | Covered baseline | Indexes, triggers, RLS, tenant columns, service-role policies, authenticated owner policies, rate-limit RPC, and knowledge tables/RPC are included. Apps still own JWT tenant/admin claims. |
| Conversation history UX | Partial | Server endpoints, in-memory persistence, Supabase persistence, React controller hooks, and a packaged history panel cover list/load/rename/delete/search wiring. Message pagination is still roadmap. |
| Usage and cost tracking | Covered for Supabase | Handler records usage on finish and `createSupabaseUsageAdapter` persists it to `ai_usage_events`; pricing remains app-supplied through `estimateCost`. |
| Documentation and examples | Partial | README coverage exists; complete runnable examples still need expansion. |
| Observability | Covered baseline | Request/model/tool lifecycle, latency, permission-denied, and rate-limit audit events are emitted through `AuditAdapter`. |
| Knowledge/RAG | Covered baseline | `createKnowledgeTool`, `createSupabaseKnowledgeAdapter`, pgvector tables, indexes, and `ai_match_knowledge` are included. Apps still own ingestion, embeddings, and ACL policy. |

## Recommendations

- Keep `requireAuth: true` on internal chat routes.
- Enforce tenant isolation in persistence and history.
- Apply request and tool execution rate limits separately.
- Keep destructive approvals and audit events app-owned but SDK-compatible.
- Keep knowledge ingestion and control-plane settings optional so products can adopt them incrementally.
