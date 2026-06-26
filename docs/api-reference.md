# API Reference

This page is the exhaustive public surface of the SDK packages. If an export is not listed here, it is not part of the documented public API.

## Package Subpaths

- `@rsainth/chatdock-sdk`: reexports the `@rsainth/server` surface.
- `@rsainth/chatdock-sdk/server`: reexports `@rsainth/server`.
- `@rsainth/chatdock-sdk/react`: reexports `@rsainth/react`.
- `@rsainth/chatdock-sdk/next`: reexports `@rsainth/next`.
- `@rsainth/chatdock-sdk/supabase`: reexports `@rsainth/supabase`.
- `@rsainth/chatdock-sdk/styles.css`: imports the React package stylesheet.
- `@rsainth/chatdock-sdk/supabase/schema.sql`: exposes the Supabase schema.

## `@rsainth/server`

Runtime exports:

- `allOfToolAuthorizers`
- `allowFeatureFlag`
- `allowRoles`
- `allowTenant`
- `anyOfToolAuthorizers`
- `assertSameTenant`
- `coerceLocaleBoolean`
- `coerceLocaleDate`
- `coerceLocaleNumber`
- `competenciaSchema`
- `createAuditedExecutor`
- `createChatbotHandler`
- `createConversationHistoryHandler`
- `createInMemoryAuditAdapter`
- `createInMemoryDebugTraceAdapter`
- `createInMemoryPersistence`
- `createInMemoryToolExecutionRateLimit`
- `createInMemoryUsageAdapter`
- `createInMemoryUsageBudget`
- `createKnowledgeTool`
- `createKnowledgeToolInputSchema`
- `createMockRuntimeContext`
- `createMockToolContext`
- `createNoopAuditAdapter`
- `createNoopRateLimitAdapter`
- `createNoopToolExecutionRateLimitAdapter`
- `createNoopUsageAdapter`
- `createToolManifest`
- `createToolPolicyAuthorizer`
- `createToolRegistry`
- `createToolSuite`
- `defineSystemPrompt`
- `defineTool`
- `denyDestructiveInDemo`
- `estimateModelCost`
- `estimateUsageCost`
- `expectToolAuthorized`
- `expectToolDenied`
- `filterAuthorizedTools`
- `getTenantId`
- `normalizeToolInput`
- `normalizeToolInputFields`
- `redactDebugText`
- `redactDebugTrace`
- `requireHumanApproval`
- `requireTenant`
- `resolveRequestTools`
- `runToolTest`
- `sanitizeHallucinatedId`
- `sanitizeNullableId`
- `toolDenied`
- `toolError`
- `toolOk`

Type exports:

- `AuditAdapter`
- `AuditEvent`
- `AuthAdapter`
- `Awaitable`
- `ChatIntent`
- `ChatbotClientContext`
- `ChatbotDebugTrace`
- `ChatbotDebugTraceMessage`
- `ChatbotDebugTraceMessagePart`
- `ChatbotDebugTraceTool`
- `ChatbotErrorBody`
- `ChatbotErrorCode`
- `ChatbotHandler`
- `ChatbotHandlerOptions`
- `ChatbotModel`
- `ChatbotRequestBody`
- `ChatbotRuntimeConfig`
- `ChatbotRuntimeContext`
- `ChatbotTenant`
- `ChatbotTool`
- `ChatbotToolExecute`
- `ChatbotUser`
- `ConversationHistoryHandlerOptions`
- `ConversationRecord`
- `ConversationRecordWithMessages`
- `CreateKnowledgeToolOptions`
- `DebugTraceAdapter`
- `DebugTraceEvent`
- `DefineToolInput`
- `InMemoryDebugTraceAdapter`
- `InMemoryToolExecutionRateLimitOptions`
- `IntentDetector`
- `IntentRoute`
- `JsonObject`
- `JsonPrimitive`
- `JsonValue`
- `KnowledgeAdapter`
- `KnowledgeChunk`
- `KnowledgeCitation`
- `KnowledgeDocument`
- `KnowledgeMetadata`
- `KnowledgeSearchInput`
- `KnowledgeSearchResult`
- `KnowledgeSource`
- `KnowledgeToolFilters`
- `KnowledgeToolInput`
- `KnowledgeToolInputSchema`
- `KnowledgeToolOutput`
- `KnowledgeToolSearchResult`
- `MockRuntimeContextOptions`
- `ModelResolver`
- `PersistenceAdapter`
- `RateLimitAdapter`
- `ResolveToolsHook`
- `ResolvedTools`
- `RuntimeConfigAdapter`
- `RuntimeToolConfig`
- `SystemPromptDefinition`
- `SystemPromptPart`
- `ToolAuthorizationPhase`
- `ToolAuthorizationResult`
- `ToolAuthorizationTestResult`
- `ToolAuthorize`
- `ToolAvailability`
- `ToolDeniedTestResult`
- `ToolExecutionRateLimitAdapter`
- `ToolInputNormalizer`
- `ToolInputNormalizerInput`
- `ToolInputSchema`
- `ToolInputValueNormalizer`
- `ToolManifestEntry`
- `ToolPermissionRule`
- `ToolPolicyMatrix`
- `ToolPolicyRule`
- `ToolResolverInput`
- `ToolResolverResult`
- `ToolResult`
- `ToolSuite`
- `ToolSuiteDefaults`
- `ToolTestOptions`
- `UsageAdapter`
- `UsageBudgetAdapter`
- `UsageBudgetResult`
- `UsageCostInput`
- `UsageEvent`

## `@rsainth/react`

Runtime exports:

- `ChatbotComposer`
- `ChatbotConversationList`
- `ChatbotDebugPanel`
- `ChatbotErrorBoundary`
- `ChatbotHistoryPanel`
- `ChatbotLauncher`
- `ChatbotMessageList`
- `ChatbotMessages`
- `ChatbotPanel`
- `ChatbotProvider`
- `ChatbotSuggestions`
- `MessageList`
- `createChatbotTransport`
- `createConversationHistoryClient`
- `defaultChatbotLabels`
- `useChatbot`
- `useChatbotConversations`

Type exports:

- `ChatbotChatController`
- `ChatbotClientContext`
- `ChatbotComposerProps`
- `ChatbotContextValue`
- `ChatbotConversation`
- `ChatbotConversationListOptions`
- `ChatbotConversationSearchOptions`
- `ChatbotConversationSummary`
- `ChatbotDebugPanelProps`
- `ChatbotDebugTrace`
- `ChatbotDebugTraceEvent`
- `ChatbotDebugTraceMessage`
- `ChatbotDebugTraceMessagePart`
- `ChatbotDebugTraceTool`
- `ChatbotHistoryClientOptions`
- `ChatbotHistoryPanelProps`
- `ChatbotLabels`
- `ChatbotLauncherProps`
- `ChatbotMessageProps`
- `ChatbotMessagesProps`
- `ChatbotPanelProps`
- `ChatbotProviderProps`
- `ChatbotProviderValue`
- `ChatbotSuggestionRenderProps`
- `ChatbotSuggestionsProps`
- `ChatbotTransportOptions`
- `ChatbotTrigger`
- `UseChatbotConversationsOptions`

## `@rsainth/next`

Runtime exports:

- `createHeaderAuthAdapter`
- `createNextChatbotRoute`
- `getBearerToken`

Type exports:

- `NextChatbotRouteOptions`

## `@rsainth/supabase`

Runtime exports:

- `createSupabaseAuditAdapter`
- `createSupabaseAuthAdapter`
- `createSupabaseChatbotHandler`
- `createSupabaseKnowledgeAdapter`
- `createSupabasePersistence`
- `createSupabaseRateLimitAdapter`
- `createSupabaseUsageAdapter`

Type exports:

- `SupabaseAuthOptions`
- `SupabaseChatbotHandlerOptions`
- `SupabaseClientLike`
- `SupabaseKnowledgeEmbedding`
- `SupabaseKnowledgeEmbeddingInput`
- `SupabaseKnowledgeOptions`
- `SupabasePersistenceOptions`
- `SupabaseRateLimitOptions`
- `SupabaseRateLimitRule`
- `SupabaseUsageOptions`

## CLI

The `chatdock-sdk` binary exposes these commands:

- `chatdock-sdk init`
- `chatdock-sdk make-tool`
- `chatdock-sdk sync-tools`
- `chatdock-sdk watch-tools`
- `chatdock-sdk doctor`
- `chatdock-sdk help`
