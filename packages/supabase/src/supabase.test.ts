import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  createSupabaseKnowledgeAdapter,
  createSupabasePersistence,
  createSupabaseRateLimitAdapter,
  createSupabaseUsageAdapter,
  type SupabaseClientLike,
} from "./supabase";
import type { ChatbotUser } from "@rsainth/server";

describe("createSupabaseRateLimitAdapter", () => {
  it("uses the ai_check_rate_limit rpc and blocks denied requests", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        allowed: false,
        retry_after: 42,
      },
      error: null,
    }));
    const client = { rpc } as unknown as SupabaseClientLike;
    const adapter = createSupabaseRateLimitAdapter({
      adminClient: client,
      keyPrefix: "chatbot",
      rules: [
        {
          name: "messages_per_user_hour",
          limit: 100,
          windowSeconds: 3600,
        },
      ],
    });

    const result = await adapter.check({
      request: new Request("https://example.com"),
      user: { id: "user_1", tenantId: "tenant_1" },
      body: {},
      services: {},
    });

    expect(rpc).toHaveBeenCalledWith("ai_check_rate_limit", {
      p_key: "chatbot:messages_per_user_hour:tenant:tenant_1:user:user_1",
      p_limit: 100,
      p_window_seconds: 3600,
    });
    expect(result).toEqual({
      allowed: false,
      reason: "Rate limit exceeded",
      retryAfter: 42,
    });
  });
});

describe("schema sql", () => {
  it("keeps the published schema in sync with the SDK copy", async () => {
    const [supabaseSchema, sdkSchema] = await Promise.all([
      readFile(new URL("./schema.sql", import.meta.url), "utf8"),
      readFile(new URL("../../chatdock-sdk/src/supabase/schema.sql", import.meta.url), "utf8"),
    ]);

    expect(supabaseSchema).toBe(sdkSchema);
  });
});

describe("createSupabasePersistence", () => {
  it("supports conversation history operations scoped by user and tenant", async () => {
    const client = createMemorySupabaseClient();
    const persistence = createSupabasePersistence({ adminClient: client });
    const user: ChatbotUser = { id: "user_1", tenantId: "tenant_1" };
    const otherUser: ChatbotUser = { id: "user_2", tenantId: "tenant_1" };

    const conversation = await persistence.getOrCreateConversation({
      conversationId: "conv_1",
      user,
      context: { pathname: "/clientes" },
    });
    await persistence.saveMessage({
      conversationId: conversation.id,
      user,
      message: {
        id: "msg_1",
        role: "user",
        parts: [{ type: "text", text: "cliente VIP precisa de retorno" }],
      } as never,
    });
    await persistence.getOrCreateConversation({
      conversationId: "conv_2",
      user: otherUser,
      context: {},
    });

    await expect(persistence.listConversations?.({ user })).resolves.toEqual([
      expect.objectContaining({
        id: "conv_1",
        userId: "user_1",
        tenantId: "tenant_1",
      }),
    ]);

    await expect(
      persistence.loadConversation?.({
        conversationId: "conv_1",
        user,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "conv_1",
        messages: [
          {
            id: "msg_1",
            role: "user",
            parts: [{ type: "text", text: "cliente VIP precisa de retorno" }],
          },
        ],
      }),
    );

    await expect(
      persistence.updateConversation?.({
        conversationId: "conv_1",
        user,
        title: "Atendimento VIP",
        metadata: { source: "test" },
      }),
    ).resolves.toEqual(expect.objectContaining({ id: "conv_1", title: "Atendimento VIP" }));

    await expect(
      persistence.searchConversations?.({
        user,
        query: "VIP",
      }),
    ).resolves.toEqual([expect.objectContaining({ id: "conv_1" })]);

    await expect(
      persistence.deleteConversation?.({
        conversationId: "conv_1",
        user,
      }),
    ).resolves.toBe(true);
    await expect(
      persistence.loadConversation?.({
        conversationId: "conv_1",
        user,
      }),
    ).resolves.toBeNull();
  });
});

describe("createSupabaseUsageAdapter", () => {
  it("records usage events in ai_usage_events", async () => {
    const client = createMemorySupabaseClient();
    const estimateCost = vi.fn(() => 0.001);
    const adapter = createSupabaseUsageAdapter({ adminClient: client, estimateCost });
    const createdAt = new Date("2026-01-02T03:04:05.000Z");

    await adapter.record({
      type: "usage.recorded",
      conversation_id: "conv_1",
      user_id: "user_1",
      tenant: "tenant_1",
      provider: "openai",
      model: "gpt-test",
      input_tokens: 12,
      output_tokens: 34,
      tool_calls_count: 2,
      cost_estimate: 0.001,
      created_at: createdAt,
    });

    expect(client.tables.ai_usage_events).toEqual([
      expect.objectContaining({
        conversation_id: "conv_1",
        user_id: "user_1",
        tenant_id: "tenant_1",
        provider: "openai",
        model: "gpt-test",
        input_tokens: 12,
        output_tokens: 34,
        tool_calls_count: 2,
        cost_estimate: 0.001,
        created_at: createdAt.toISOString(),
      }),
    ]);
    expect(await adapter.estimateCost?.({} as never)).toBe(0.001);
  });
});

describe("createSupabaseKnowledgeAdapter", () => {
  it("embeds the query and maps ai_match_knowledge rpc rows", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          chunk_id: "chunk_1",
          content: "Contrato social atualizado em 2026.",
          document_id: "doc_1",
          document_title: "Contrato social",
          document_uri: "https://example.com/contrato.pdf",
          source_id: "source_1",
          source_name: "Drive juridico",
          source_type: "drive",
          source_uri: "https://example.com",
          score: 0.92,
          metadata: { tenantVisible: true },
          chunk_metadata: { page: 3 },
          document_metadata: { category: "juridico" },
          source_metadata: { owner: "legal" },
        },
      ],
      error: null,
    }));
    const queryEmbedding = vi.fn(async () => [0.1, 0.2, 0.3]);
    const client = { rpc } as unknown as SupabaseClientLike;
    const adapter = createSupabaseKnowledgeAdapter({
      adminClient: client,
      queryEmbedding,
      matchThreshold: 0.75,
    });

    const result = await adapter.search({
      query: "contrato social",
      limit: 3,
      filters: { source_type: "drive" },
      context: {
        request: new Request("https://example.com"),
        user: { id: "user_1", tenantId: "tenant_1" },
        conversationId: "conv_1",
        clientContext: {},
        services: { embeddingModel: "test" },
      },
    });

    expect(queryEmbedding).toHaveBeenCalledWith({
      query: "contrato social",
      services: { embeddingModel: "test" },
      context: expect.objectContaining({
        user: { id: "user_1", tenantId: "tenant_1" },
      }),
    });
    expect(rpc).toHaveBeenCalledWith("ai_match_knowledge", {
      p_tenant_id: "tenant_1",
      p_query_embedding: [0.1, 0.2, 0.3],
      p_match_count: 3,
      p_filters: { source_type: "drive" },
      p_match_threshold: 0.75,
    });
    expect(result).toEqual([
      {
        chunk: {
          id: "chunk_1",
          content: "Contrato social atualizado em 2026.",
          documentId: "doc_1",
          sourceId: "source_1",
          title: "Contrato social",
          uri: "https://example.com/contrato.pdf",
          metadata: { page: 3 },
        },
        document: {
          id: "doc_1",
          sourceId: "source_1",
          title: "Contrato social",
          uri: "https://example.com/contrato.pdf",
          metadata: { category: "juridico" },
        },
        source: {
          id: "source_1",
          name: "Drive juridico",
          type: "drive",
          uri: "https://example.com",
          metadata: { owner: "legal" },
        },
        score: 0.92,
        metadata: { tenantVisible: true },
      },
    ]);
  });

  it("can require tenant isolation for knowledge searches", async () => {
    const adapter = createSupabaseKnowledgeAdapter({
      adminClient: { rpc: vi.fn() } as unknown as SupabaseClientLike,
      queryEmbedding: vi.fn(async () => [0.1]),
      requireTenant: true,
    });

    await expect(
      adapter.search({
        query: "x",
        limit: 1,
        context: {
          request: new Request("https://example.com"),
          user: { id: "user_1" },
          conversationId: "conv_1",
          clientContext: {},
          services: {},
        },
      }),
    ).rejects.toThrow("tenantId");
  });
});

type TableMap = Record<string, Record<string, unknown>[]>;

function createMemorySupabaseClient(seed: TableMap = {}) {
  const tables: TableMap = {
    ai_conversations: [],
    ai_messages: [],
    ai_usage_events: [],
    ...seed,
  };

  return {
    tables,
    from(table: string) {
      tables[table] ??= [];
      return new MemoryQueryBuilder(tables, table);
    },
  } as unknown as SupabaseClientLike & { tables: TableMap };
}

class MemoryQueryBuilder {
  private operation: "select" | "insert" | "update" | "delete" = "select";
  private values: unknown;
  private filters: Array<{ column: string; value: unknown }> = [];
  private orFilter: string | undefined;
  private orderBy: { column: string; ascending: boolean } | undefined;
  private limitCount: number | undefined;

  constructor(
    private readonly tables: TableMap,
    private readonly table: string,
  ) {}

  select() {
    return this;
  }

  insert(values: unknown) {
    this.operation = "insert";
    this.values = values;
    return this;
  }

  update(values: unknown) {
    this.operation = "update";
    this.values = values;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  or(filters: string) {
    this.orFilter = filters;
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.orderBy = { column, ascending: options.ascending ?? true };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  async maybeSingle() {
    const rows = this.execute();
    return { data: rows[0] ?? null, error: null };
  }

  async single() {
    const rows = this.execute();
    return rows[0]
      ? { data: rows[0], error: null }
      : { data: null, error: { message: "No rows returned" } };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: this.execute(), error: null }).then(onfulfilled, onrejected);
  }

  private execute() {
    if (this.operation === "insert") {
      const rows = (Array.isArray(this.values) ? this.values : [this.values]).map((value) => ({
        id: `${this.table}_${this.tables[this.table]!.length + 1}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(isRecord(value) ? value : {}),
      }));
      for (const row of rows) {
        if (row.id == null) {
          row.id = `${this.table}_${this.tables[this.table]!.length + 1}`;
        }
        this.tables[this.table]!.push(row);
      }
      return rows;
    }

    const matching = this.matchingRows();

    if (this.operation === "update") {
      for (const row of matching) {
        Object.assign(row, this.values);
      }
      return matching;
    }

    if (this.operation === "delete") {
      this.tables[this.table] = this.tables[this.table]!.filter((row) => !matching.includes(row));
      return matching;
    }

    return this.applyReadModifiers(matching);
  }

  private matchingRows() {
    return this.tables[this.table]!.filter((row) => {
      const matchesEq = this.filters.every((filter) => row[filter.column] === filter.value);
      if (!matchesEq) {
        return false;
      }
      if (!this.orFilter) {
        return true;
      }
      return this.matchesOrFilter(row);
    });
  }

  private applyReadModifiers(rows: Record<string, unknown>[]) {
    let result = [...rows];
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      result = result.sort((left, right) => {
        const leftValue = String(left[column] ?? "");
        const rightValue = String(right[column] ?? "");
        return ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
      });
    }
    return this.limitCount == null ? result : result.slice(0, this.limitCount);
  }

  private matchesOrFilter(row: Record<string, unknown>) {
    return this.orFilter!.split(",").some((part) => {
      const [column, operator, rawPattern] = part.split(".");
      if (operator !== "ilike" || !column || !rawPattern) {
        return false;
      }
      const pattern = rawPattern.replace(/^%|%$/g, "").replace(/\\/g, "").toLowerCase();
      return String(row[column] ?? "").toLowerCase().includes(pattern);
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
