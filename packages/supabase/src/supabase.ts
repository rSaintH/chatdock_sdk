import {
  createChatbotHandler,
  type AuditAdapter,
  type AuthAdapter,
  type Awaitable,
  type ChatbotHandlerOptions,
  type ChatbotUser,
  type ConversationRecord,
  type KnowledgeAdapter,
  type KnowledgeDocument,
  type KnowledgeMetadata,
  type KnowledgeSearchResult,
  type KnowledgeSource,
  type PersistenceAdapter,
  type RateLimitAdapter,
  type UsageAdapter
} from "@rscheln/server";

type QueryResult<T> = Promise<{ data: T | null; error: { message: string } | null }>;

export type SupabaseClientLike = {
  auth?: {
    getUser(jwt?: string): Promise<{
      data: { user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null };
      error: { message: string } | null;
    }>;
  };
  from(table: string): {
    select(columns?: string): unknown;
    insert(values: unknown): unknown;
    upsert(values: unknown): unknown;
    update(values: unknown): unknown;
    delete(): unknown;
  };
  rpc?(fn: string, args?: Record<string, unknown>): unknown;
};

type QueryBuilder = {
  select(columns?: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  or(filters: string): QueryBuilder;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder;
  limit(count: number): QueryBuilder;
  maybeSingle(): QueryResult<Record<string, unknown>>;
  single(): QueryResult<Record<string, unknown>>;
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>;
};

export type SupabaseChatbotHandlerOptions<AppContext = unknown, AppUser = unknown> =
  ChatbotHandlerOptions<AppContext> & {
    auth?: AuthAdapter<AppContext>;
    appUser?: AppUser;
  };

export function createSupabaseChatbotHandler<AppContext = unknown, AppUser = unknown>(
  options: SupabaseChatbotHandlerOptions<AppContext, AppUser>
) {
  const { auth, ...handlerOptions } = options;
  return createChatbotHandler({
    ...handlerOptions,
    ...((handlerOptions.authAdapter ?? auth) ? { authAdapter: handlerOptions.authAdapter ?? auth } : {})
  });
}

export type SupabaseAuthOptions = {
  client: SupabaseClientLike;
  mapUser?: (user: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => ChatbotUser;
};

export function createSupabaseAuthAdapter(options: SupabaseAuthOptions): AuthAdapter {
  return {
    async authenticate({ request }) {
      if (!options.client.auth) {
        throw new Response("Supabase auth client is not configured", { status: 500 });
      }

      const jwt = getBearerToken(request);
      if (!jwt) {
        return null;
      }

      const { data, error } = await options.client.auth.getUser(jwt);
      if (error || !data.user) {
        return null;
      }

      const user = options.mapUser?.(data.user) ?? userFromSupabaseAuth(data.user);

      return user;
    }
  };
}

export type SupabasePersistenceOptions = {
  adminClient: SupabaseClientLike;
  conversationsTable?: string;
  messagesTable?: string;
  tenantIdFallback?: string;
  requireTenant?: boolean;
  messageHistoryLimit?: number;
  conversationMessagesLimit?: number;
};

export function createSupabasePersistence(options: SupabasePersistenceOptions): PersistenceAdapter {
  const conversations = options.conversationsTable ?? "ai_conversations";
  const messages = options.messagesTable ?? "ai_messages";
  const client = options.adminClient;
  const messageHistoryLimit = options.messageHistoryLimit ?? 50;
  const conversationMessagesLimit = options.conversationMessagesLimit ?? 500;
  async function listConversations(input: {
    user: ChatbotUser | null;
    limit?: number;
  }): Promise<ConversationRecord[]> {
    const scope = resolveUserScope(input.user, options);
    const result = await toBuilder(client.from(conversations).select("*"))
      .eq("user_id", scope.userId)
      .eq("tenant_id", scope.tenantId)
      .order("updated_at", { ascending: false })
      .limit(normalizeLimit(input.limit, 50));

    if (result.error) throw new Error(result.error.message);
    return rowsFromResult(result).map(conversationRecordFromRow);
  }

  return {
    async getOrCreateConversation(input) {
      const scope = resolveUserScope(input.user, options);

      if (input.conversationId) {
        const existing = await toBuilder(client.from(conversations).select("*"))
          .eq("id", input.conversationId)
          .eq("user_id", scope.userId)
          .eq("tenant_id", scope.tenantId)
          .maybeSingle();

        if (existing.error) throw new Error(existing.error.message);
        if (existing.data) {
          return conversationRecordFromRow(existing.data);
        }
      }

      const now = new Date().toISOString();
      const inserted = await toBuilder(
        client.from(conversations).insert({
          id: input.conversationId,
          user_id: scope.userId,
          tenant_id: scope.tenantId,
          title: null,
          metadata: input.context ?? {},
          created_at: now,
          updated_at: now
        })
      )
        .select("*")
        .single();

      if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? "Failed to create conversation");

      return conversationRecordFromRow(inserted.data);
    },
    async loadMessages(input) {
      const scope = resolveUserScope(input.user, options);
      const result = await toBuilder(client.from(messages).select("*"))
        .eq("conversation_id", input.conversationId)
        .eq("user_id", scope.userId)
        .eq("tenant_id", scope.tenantId)
        .order("created_at", { ascending: true })
        .limit(messageHistoryLimit);

      if (result.error) throw new Error(result.error.message);
      return messagesFromRows(rowsFromResult(result));
    },
    async saveMessage(input) {
      const scope = resolveUserScope(input.user, options);
      const now = new Date().toISOString();
      const preview = messagePreview(input.message);
      const inserted = await toBuilder(
        client.from(messages).insert({
          conversation_id: input.conversationId,
          user_id: scope.userId,
          tenant_id: scope.tenantId,
          role: input.message.role,
          message: input.message,
          metadata: {},
          created_at: now
        })
      )
        .select("*")
        .single();

      if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? "Failed to save message");

      await toBuilder(
        client.from(conversations).update({
          updated_at: now,
          ...(preview ? { last_message_preview: preview } : {})
        })
      )
        .eq("id", input.conversationId)
        .eq("user_id", scope.userId)
        .eq("tenant_id", scope.tenantId);

      void inserted;
    },
    listConversations,
    async loadConversation(input) {
      const scope = resolveUserScope(input.user, options);
      const conversation = await toBuilder(client.from(conversations).select("*"))
        .eq("id", input.conversationId)
        .eq("user_id", scope.userId)
        .eq("tenant_id", scope.tenantId)
        .maybeSingle();

      if (conversation.error) throw new Error(conversation.error.message);
      if (!conversation.data) {
        return null;
      }

      const result = await toBuilder(client.from(messages).select("*"))
        .eq("conversation_id", input.conversationId)
        .eq("user_id", scope.userId)
        .eq("tenant_id", scope.tenantId)
        .order("created_at", { ascending: true })
        .limit(conversationMessagesLimit);

      if (result.error) throw new Error(result.error.message);

      return {
        ...conversationRecordFromRow(conversation.data),
        messages: messagesFromRows(rowsFromResult(result))
      };
    },
    async updateConversation(input) {
      const scope = resolveUserScope(input.user, options);
      const existing = await toBuilder(client.from(conversations).select("*"))
        .eq("id", input.conversationId)
        .eq("user_id", scope.userId)
        .eq("tenant_id", scope.tenantId)
        .maybeSingle();

      if (existing.error) throw new Error(existing.error.message);
      if (!existing.data) {
        return null;
      }

      const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString()
      };
      if (input.title !== undefined) {
        payload.title = input.title;
      }
      if (input.metadata) {
        payload.metadata = {
          ...(asRecord(existing.data.metadata) ?? {}),
          ...input.metadata
        };
      }

      const updated = await toBuilder(client.from(conversations).update(payload))
        .eq("id", input.conversationId)
        .eq("user_id", scope.userId)
        .eq("tenant_id", scope.tenantId)
        .select("*")
        .maybeSingle();

      if (updated.error) throw new Error(updated.error.message);
      return updated.data ? conversationRecordFromRow(updated.data) : null;
    },
    async deleteConversation(input) {
      const scope = resolveUserScope(input.user, options);
      const deleted = await toBuilder(client.from(conversations).delete())
        .eq("id", input.conversationId)
        .eq("user_id", scope.userId)
        .eq("tenant_id", scope.tenantId)
        .select("id")
        .maybeSingle();

      if (deleted.error) throw new Error(deleted.error.message);
      return Boolean(deleted.data);
    },
    async searchConversations(input) {
      const query = input.query.trim();
      if (!query) {
        return listConversations({
          user: input.user,
          ...(input.limit == null ? {} : { limit: input.limit })
        });
      }

      const scope = resolveUserScope(input.user, options);
      const pattern = escapePostgrestPattern(query);
      const result = await toBuilder(client.from(conversations).select("*"))
        .eq("user_id", scope.userId)
        .eq("tenant_id", scope.tenantId)
        .or(`title.ilike.%${pattern}%,last_message_preview.ilike.%${pattern}%`)
        .order("updated_at", { ascending: false })
        .limit(normalizeLimit(input.limit, 50));

      if (result.error) throw new Error(result.error.message);
      return rowsFromResult(result).map(conversationRecordFromRow);
    }
  };
}

export function createSupabaseAuditAdapter(client: SupabaseClientLike, table = "ai_tool_audit"): AuditAdapter {
  async function insert(event: string, payload: unknown) {
    const record = asRecord(payload);
    const user = asRecord(record?.user);
    const result = await toBuilder(
      client.from(table).insert({
        event,
        conversation_id: readString(record, "conversationId"),
        user_id: readString(user, "id"),
        tenant_id: readString(user, "tenantId"),
        tool_name: readString(record, "toolName"),
        payload,
        created_at: new Date().toISOString()
      })
    );
    if (result.error) throw new Error(result.error.message);
  }

  return {
    record: (event) => insert(event.type, event)
  };
}

export type SupabaseUsageOptions<TServices = unknown> = {
  adminClient: SupabaseClientLike;
  table?: string;
  estimateCost?: UsageAdapter<TServices>["estimateCost"];
};

export function createSupabaseUsageAdapter<TServices = unknown>(
  options: SupabaseUsageOptions<TServices>
): UsageAdapter<TServices> {
  const table = options.table ?? "ai_usage_events";

  return {
    ...(options.estimateCost ? { estimateCost: options.estimateCost } : {}),
    async record(event) {
      const result = await toBuilder(
        options.adminClient.from(table).insert({
          conversation_id: event.conversation_id,
          user_id: event.user_id,
          tenant_id: event.tenant,
          provider: event.provider,
          model: event.model,
          input_tokens: event.input_tokens ?? 0,
          output_tokens: event.output_tokens ?? 0,
          tool_calls_count: event.tool_calls_count,
          cost_estimate: event.cost_estimate ?? 0,
          usage: {
            ...event,
            created_at: event.created_at.toISOString()
          },
          created_at: event.created_at.toISOString()
        })
      );

      if (result.error) throw new Error(result.error.message);
    }
  };
}

type SupabaseRateLimitCheckInput<TServices> = Parameters<RateLimitAdapter<TServices>["check"]>[0];

export type SupabaseRateLimitRule<TServices = unknown> = {
  name: string;
  limit: number;
  windowSeconds: number;
  reason?: string;
  when?: (input: SupabaseRateLimitCheckInput<TServices>) => Awaitable<boolean>;
  key?: (input: SupabaseRateLimitCheckInput<TServices>) => Awaitable<string | null | undefined>;
};

export type SupabaseRateLimitOptions<TServices = unknown> = {
  adminClient: SupabaseClientLike;
  keyPrefix?: string;
  rules?: SupabaseRateLimitRule<TServices>[];
};

export function createSupabaseRateLimitAdapter<TServices = unknown>(
  options: SupabaseRateLimitOptions<TServices>
): RateLimitAdapter<TServices> {
  const rules = options.rules?.length
    ? options.rules
    : [
        {
          name: "messages_per_user_hour",
          limit: 100,
          windowSeconds: 60 * 60
        }
      ];

  return {
    async check(input) {
      for (const rule of rules) {
        if (rule.limit <= 0 || rule.windowSeconds <= 0) {
          throw new Error(`Invalid Supabase rate limit rule "${rule.name}".`);
        }

        if (rule.when && !(await rule.when(input))) {
          continue;
        }

        const resolvedKey = (await rule.key?.(input)) ?? defaultRateLimitKey(input);
        if (!resolvedKey) {
          continue;
        }

        const result = await checkRateLimit(options.adminClient, {
          key: [options.keyPrefix, rule.name, resolvedKey].filter(Boolean).join(":"),
          limit: rule.limit,
          windowSeconds: rule.windowSeconds
        });

        if (!result.allowed) {
          return result.retryAfter == null ? {
            allowed: false,
            reason: rule.reason ?? "Rate limit exceeded"
          } : {
            allowed: false,
            reason: rule.reason ?? "Rate limit exceeded",
            retryAfter: result.retryAfter
          };
        }
      }

      return { allowed: true };
    }
  };
}

export type SupabaseKnowledgeEmbeddingInput<TServices = unknown> = {
  query: string;
  services: TServices;
  context: Parameters<KnowledgeAdapter<TServices>["search"]>[0]["context"];
};

export type SupabaseKnowledgeEmbedding = number[] | string;

export type SupabaseKnowledgeOptions<TServices = unknown> = {
  adminClient: SupabaseClientLike;
  rpcName?: string;
  tenantIdFallback?: string;
  requireTenant?: boolean;
  matchThreshold?: number;
  queryEmbedding?: (input: SupabaseKnowledgeEmbeddingInput<TServices>) => Awaitable<SupabaseKnowledgeEmbedding>;
  embedding?: (input: SupabaseKnowledgeEmbeddingInput<TServices>) => Awaitable<SupabaseKnowledgeEmbedding>;
};

export function createSupabaseKnowledgeAdapter<TServices = unknown>(
  options: SupabaseKnowledgeOptions<TServices>
): KnowledgeAdapter<TServices> {
  const rpcName = options.rpcName ?? "ai_match_knowledge";
  const embed = options.queryEmbedding ?? options.embedding;

  if (!embed) {
    throw new Error("Supabase knowledge adapter requires queryEmbedding or embedding.");
  }

  return {
    async search(input) {
      if (!options.adminClient.rpc) {
        throw new Error("Supabase knowledge adapter requires a client with rpc support.");
      }

      const tenantId = resolveKnowledgeTenant(input.context.user, options);
      const queryEmbedding = await embed({
        query: input.query,
        services: input.context.services,
        context: input.context
      });
      const args: Record<string, unknown> = {
        p_tenant_id: tenantId,
        p_query_embedding: queryEmbedding,
        p_match_count: normalizeLimit(input.limit, 10),
        p_filters: input.filters ?? {}
      };

      if (options.matchThreshold != null) {
        args.p_match_threshold = options.matchThreshold;
      }

      const result = (await options.adminClient.rpc(rpcName, args)) as {
        data: unknown;
        error: { message: string } | null;
      };

      if (result.error) {
        throw new Error(result.error.message);
      }

      return rowsFromResult(result).map(knowledgeSearchResultFromRow);
    }
  };
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(record: Record<string, unknown> | undefined, key: string): string[] | undefined {
  const value = record?.[key];
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return strings.length > 0 ? strings : undefined;
}

function userFromSupabaseAuth(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): ChatbotUser {
  const metadata = {
    ...(user.email ? { email: user.email } : {}),
    ...(user.user_metadata ?? {})
  };
  const chatbotUser: ChatbotUser = {
    id: user.id,
    metadata
  };

  const roles = readStringArray(user.user_metadata, "roles");
  if (roles) {
    chatbotUser.roles = roles;
  }

  const tenantId = readString(user.user_metadata, "tenant_id") ?? readString(user.user_metadata, "tenantId");
  if (tenantId) {
    chatbotUser.tenantId = tenantId;
  }

  return chatbotUser;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function conversationRecordFromRow(row: Record<string, unknown>): ConversationRecord {
  const record: ConversationRecord = {
    id: String(row.id),
    userId: String(row.user_id),
    tenantId: String(row.tenant_id),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at))
  };
  const title = readString(row, "title");
  if (title) {
    record.title = title;
  }
  const metadata = asRecord(row.metadata);
  if (metadata) {
    record.metadata = metadata;
  }
  return record;
}

function toBuilder(value: unknown): QueryBuilder {
  return value as QueryBuilder;
}

function rowsFromResult(result: { data: unknown }): Record<string, unknown>[] {
  return Array.isArray(result.data) ? result.data.map(asRecord).filter(Boolean) as Record<string, unknown>[] : [];
}

function messagesFromRows(rows: Record<string, unknown>[]): Awaited<ReturnType<PersistenceAdapter["loadMessages"]>> {
  return rows.map((row) => row.message).filter(Boolean) as Awaited<ReturnType<PersistenceAdapter["loadMessages"]>>;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value == null || value < 1) {
    return fallback;
  }

  return Math.trunc(value);
}

function messagePreview(message: Awaited<ReturnType<PersistenceAdapter["loadMessages"]>>[number]): string | undefined {
  const record = asRecord(message);
  const parts = Array.isArray(record?.parts) ? record.parts : [];
  const text = parts
    .map((part) => {
      const partRecord = asRecord(part);
      return partRecord?.type === "text" && typeof partRecord.text === "string" ? partRecord.text : "";
    })
    .join(" ")
    .trim()
    .replace(/\s+/g, " ");

  return text ? text.slice(0, 240) : undefined;
}

function escapePostgrestPattern(value: string): string {
  return value.replace(/[\\%_,]/g, "\\$&");
}

function resolveUserScope(user: ChatbotUser | null, options: SupabasePersistenceOptions) {
  if (options.requireTenant && !user?.tenantId) {
    throw new Error("Supabase persistence requires an authenticated user with tenantId.");
  }

  return {
    userId: user?.id ?? "anonymous",
    tenantId: user?.tenantId ?? options.tenantIdFallback ?? "default"
  };
}

function resolveKnowledgeTenant(user: ChatbotUser | null, options: Pick<SupabaseKnowledgeOptions, "requireTenant" | "tenantIdFallback">) {
  if (options.requireTenant && !user?.tenantId) {
    throw new Error("Supabase knowledge adapter requires an authenticated user with tenantId.");
  }

  return user?.tenantId ?? options.tenantIdFallback ?? "default";
}

function knowledgeSearchResultFromRow(row: Record<string, unknown>): KnowledgeSearchResult {
  const metadata = asRecord(row.metadata);
  const chunkMetadata = asRecord(row.chunk_metadata);
  const documentMetadata = asRecord(row.document_metadata);
  const sourceMetadata = asRecord(row.source_metadata);
  const result: KnowledgeSearchResult = {
    chunk: {
      id: String(row.chunk_id ?? row.id),
      content: String(row.content ?? "")
    }
  };

  assignString(result.chunk, "documentId", row.document_id);
  assignString(result.chunk, "sourceId", row.source_id);
  assignString(result.chunk, "title", row.title ?? row.document_title);
  assignString(result.chunk, "uri", row.uri ?? row.document_uri);
  assignMetadata(result.chunk, chunkMetadata);

  const document = knowledgeDocumentFromRow(row, documentMetadata);
  if (document) {
    result.document = document;
  }

  const source = knowledgeSourceFromRow(row, sourceMetadata);
  if (source) {
    result.source = source;
  }

  const score = Number(row.score ?? row.similarity);
  if (Number.isFinite(score)) {
    result.score = score;
  }

  const highlights = Array.isArray(row.highlights)
    ? row.highlights.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  if (highlights.length > 0) {
    result.highlights = highlights;
  }

  assignMetadata(result, metadata);
  return result;
}

function knowledgeDocumentFromRow(
  row: Record<string, unknown>,
  metadata: KnowledgeMetadata | undefined
): KnowledgeDocument | undefined {
  const id = readString(row, "document_id");
  if (!id) {
    return undefined;
  }

  const document: KnowledgeDocument = { id };
  assignString(document, "sourceId", row.source_id);
  assignString(document, "title", row.document_title ?? row.title);
  assignString(document, "uri", row.document_uri ?? row.uri);
  assignMetadata(document, metadata);
  return document;
}

function knowledgeSourceFromRow(
  row: Record<string, unknown>,
  metadata: KnowledgeMetadata | undefined
): KnowledgeSource | undefined {
  const id = readString(row, "source_id");
  if (!id) {
    return undefined;
  }

  const source: KnowledgeSource = { id };
  assignString(source, "name", row.source_name);
  assignString(source, "type", row.source_type);
  assignString(source, "uri", row.source_uri);
  assignMetadata(source, metadata);
  return source;
}

function assignString<T extends Record<string, unknown>>(target: T, key: keyof T & string, value: unknown) {
  if (typeof value === "string" && value.length > 0) {
    target[key] = value as T[keyof T & string];
  }
}

function assignMetadata<T extends { metadata?: KnowledgeMetadata }>(target: T, metadata: KnowledgeMetadata | undefined) {
  if (metadata) {
    target.metadata = metadata;
  }
}

function defaultRateLimitKey<TServices>(input: SupabaseRateLimitCheckInput<TServices>): string {
  if (input.user) {
    return `tenant:${input.user.tenantId ?? "default"}:user:${input.user.id}`;
  }

  return `ip:${clientIp(input.request)}`;
}

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("cf-connecting-ip")
    ?? "unknown";
}

async function checkRateLimit(
  client: SupabaseClientLike,
  input: { key: string; limit: number; windowSeconds: number }
) {
  if (!client.rpc) {
    throw new Error("Supabase rate limit adapter requires a client with rpc support.");
  }

  const result = (await client.rpc("ai_check_rate_limit", {
    p_key: input.key,
    p_limit: input.limit,
    p_window_seconds: input.windowSeconds
  })) as { data: unknown; error: { message: string } | null };

  if (result.error) {
    throw new Error(result.error.message);
  }

  const payload = Array.isArray(result.data) ? result.data[0] : result.data;
  const record = asRecord(payload);
  const retryAfter = Number(record?.retry_after ?? record?.retryAfter ?? 0);

  return Number.isFinite(retryAfter) && retryAfter > 0
    ? { allowed: record?.allowed === true, retryAfter }
    : { allowed: record?.allowed === true };
}
