import { describe, expect, it, vi } from "vitest";
import { createKnowledgeTool, createKnowledgeToolInputSchema } from "./createKnowledgeTool.js";
import type { ChatbotRuntimeContext } from "../types.js";
import type { KnowledgeAdapter } from "./types.js";

function createContext(): ChatbotRuntimeContext<{ tenantId: string }> {
  return {
    request: new Request("https://example.com"),
    user: { id: "user_1", tenantId: "tenant_1" },
    conversationId: "conv_1",
    clientContext: {},
    services: { tenantId: "tenant_1" },
  };
}

describe("createKnowledgeTool", () => {
  it("creates a search tool with a plain input schema", () => {
    const adapter: KnowledgeAdapter = {
      search: vi.fn(async () => []),
    };

    const tool = createKnowledgeTool(adapter, {
      maxLimit: 7,
    });

    expect(tool.name).toBe("search_knowledge");
    expect(tool.inputSchema).toEqual(createKnowledgeToolInputSchema(7));
  });

  it("passes normalized search input to the adapter", async () => {
    const search = vi.fn(async () => []);
    const adapter: KnowledgeAdapter<{ tenantId: string }> = { search };
    const tool = createKnowledgeTool(adapter, {
      defaultLimit: 3,
      maxLimit: 5,
      filters: ({ context }) => ({ tenantId: context.services.tenantId }),
    });
    const context = createContext();

    await tool.execute({
      input: { query: "  refund policy  ", limit: 25 },
      context,
      options: {} as never,
    });

    expect(search).toHaveBeenCalledWith({
      query: "refund policy",
      limit: 5,
      context,
      filters: { tenantId: "tenant_1" },
    });
  });

  it("returns passages with citations", async () => {
    const adapter: KnowledgeAdapter = {
      search: vi.fn(async () => [
        {
          chunk: {
            id: "chunk_1",
            documentId: "doc_1",
            content: "Enterprise contracts require annual security reviews.",
          },
          document: {
            id: "doc_1",
            sourceId: "source_1",
            title: "Security handbook",
            uri: "https://example.com/security",
          },
          source: {
            id: "source_1",
            name: "Internal docs",
          },
          score: 0.92,
        },
      ]),
    };
    const tool = createKnowledgeTool(adapter);

    const output = await tool.execute({
      input: { query: "security reviews" },
      context: createContext(),
      options: {} as never,
    });

    expect(output).toEqual({
      query: "security reviews",
      results: [
        {
          citationId: "1",
          content: "Enterprise contracts require annual security reviews.",
          chunk: {
            id: "chunk_1",
            documentId: "doc_1",
            content: "Enterprise contracts require annual security reviews.",
          },
          document: {
            id: "doc_1",
            sourceId: "source_1",
            title: "Security handbook",
            uri: "https://example.com/security",
          },
          source: {
            id: "source_1",
            name: "Internal docs",
          },
          score: 0.92,
        },
      ],
      citations: [
        {
          id: "1",
          chunkId: "chunk_1",
          documentId: "doc_1",
          sourceId: "source_1",
          title: "Security handbook",
          uri: "https://example.com/security",
          score: 0.92,
        },
      ],
    });
  });

  it("rejects blank search queries", async () => {
    const adapter: KnowledgeAdapter = {
      search: vi.fn(async () => []),
    };
    const tool = createKnowledgeTool(adapter);

    await expect(
      tool.execute({
        input: { query: "   " },
        context: createContext(),
        options: {} as never,
      }),
    ).rejects.toThrow(/query is required/);
  });
});

