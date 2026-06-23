import type { ChatbotRuntimeContext, ChatbotTool, ToolAuthorize } from "../types.js";
import type {
  KnowledgeAdapter,
  KnowledgeMetadata,
  KnowledgeSearchResult,
} from "./types.js";

const DEFAULT_TOOL_NAME = "search_knowledge";
const DEFAULT_TOOL_DESCRIPTION =
  "Searches the configured knowledge base and returns relevant passages with source citations.";
const DEFAULT_LIMIT = 5;
const DEFAULT_MAX_LIMIT = 10;

export type KnowledgeToolInput = {
  query: string;
  limit?: number;
};

export type KnowledgeCitation = {
  id: string;
  chunkId: string;
  documentId?: string;
  sourceId?: string;
  title?: string;
  uri?: string;
  score?: number;
  metadata?: KnowledgeMetadata;
};

export type KnowledgeToolSearchResult = {
  citationId: string;
  content: string;
  chunk: KnowledgeSearchResult["chunk"];
  document?: KnowledgeSearchResult["document"];
  source?: KnowledgeSearchResult["source"];
  score?: number;
  highlights?: string[];
  metadata?: KnowledgeMetadata;
};

export type KnowledgeToolOutput = {
  query: string;
  results: KnowledgeToolSearchResult[];
  citations: KnowledgeCitation[];
};

export type KnowledgeToolFilters<TServices = unknown> =
  | KnowledgeMetadata
  | ((input: {
      input: KnowledgeToolInput;
      context: ChatbotRuntimeContext<TServices>;
    }) => KnowledgeMetadata | undefined | Promise<KnowledgeMetadata | undefined>);

export type CreateKnowledgeToolOptions<TServices = unknown> = {
  name?: string;
  description?: string;
  defaultLimit?: number;
  maxLimit?: number;
  filters?: KnowledgeToolFilters<TServices>;
  metadata?: Record<string, unknown>;
  authorize?: ToolAuthorize<KnowledgeToolInput, TServices>;
};

export type KnowledgeToolInputSchema = {
  type: "object";
  properties: {
    query: {
      type: "string";
      minLength: number;
      description: string;
    };
    limit: {
      type: "integer";
      minimum: number;
      maximum: number;
      description: string;
    };
  };
  required: ["query"];
  additionalProperties: false;
};

export function createKnowledgeToolInputSchema(maxLimit = DEFAULT_MAX_LIMIT): KnowledgeToolInputSchema {
  return {
    type: "object",
    properties: {
      query: {
        type: "string",
        minLength: 1,
        description: "Natural language query to search in the knowledge base.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: maxLimit,
        description: "Maximum number of passages to return.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  };
}

export function createKnowledgeTool<TServices = unknown>(
  adapter: KnowledgeAdapter<TServices>,
  options: CreateKnowledgeToolOptions<TServices> = {},
): ChatbotTool<KnowledgeToolInput, KnowledgeToolOutput, TServices> {
  const maxLimit = readPositiveInteger(options.maxLimit, DEFAULT_MAX_LIMIT, "maxLimit");
  const defaultLimit = Math.min(
    readPositiveInteger(options.defaultLimit, DEFAULT_LIMIT, "defaultLimit"),
    maxLimit,
  );

  return {
    name: options.name ?? DEFAULT_TOOL_NAME,
    description: options.description ?? DEFAULT_TOOL_DESCRIPTION,
    inputSchema: createKnowledgeToolInputSchema(maxLimit),
    execute: async ({ input, context }) => {
      const query = readQuery(input);
      const limit = readLimit(input.limit, defaultLimit, maxLimit);
      const filters = await resolveFilters(options.filters, input, context);

      const searchInput = {
        query,
        limit,
        context,
      };

      const results = await adapter.search(filters ? { ...searchInput, filters } : searchInput);

      return toKnowledgeToolOutput(query, results);
    },
    ...(options.metadata ? { metadata: options.metadata } : {}),
    ...(options.authorize ? { authorize: options.authorize } : {}),
  };
}

function readPositiveInteger(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  if (value == null) {
    return fallback;
  }

  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`Knowledge tool option "${name}" must be a positive integer.`);
  }

  return Math.trunc(value);
}

function readQuery(input: KnowledgeToolInput): string {
  if (!input || typeof input.query !== "string") {
    throw new Error("Knowledge search query is required.");
  }

  const query = input.query.trim();
  if (!query) {
    throw new Error("Knowledge search query is required.");
  }

  return query;
}

function readLimit(
  value: number | undefined,
  defaultLimit: number,
  maxLimit: number,
): number {
  if (value == null) {
    return defaultLimit;
  }

  if (!Number.isFinite(value) || value < 1) {
    return defaultLimit;
  }

  return Math.min(Math.trunc(value), maxLimit);
}

async function resolveFilters<TServices>(
  filters: KnowledgeToolFilters<TServices> | undefined,
  input: KnowledgeToolInput,
  context: ChatbotRuntimeContext<TServices>,
): Promise<KnowledgeMetadata | undefined> {
  if (typeof filters === "function") {
    return filters({ input, context });
  }

  return filters;
}

function toKnowledgeToolOutput(
  query: string,
  searchResults: KnowledgeSearchResult[],
): KnowledgeToolOutput {
  const results: KnowledgeToolSearchResult[] = [];
  const citations: KnowledgeCitation[] = [];

  searchResults.forEach((result, index) => {
    const citationId = String(index + 1);
    results.push(toSearchResult(citationId, result));
    citations.push(toCitation(citationId, result));
  });

  return {
    query,
    results,
    citations,
  };
}

function toSearchResult(
  citationId: string,
  result: KnowledgeSearchResult,
): KnowledgeToolSearchResult {
  const item: KnowledgeToolSearchResult = {
    citationId,
    content: result.chunk.content,
    chunk: result.chunk,
  };

  if (result.document) {
    item.document = result.document;
  }
  if (result.source) {
    item.source = result.source;
  }
  if (result.score != null) {
    item.score = result.score;
  }
  if (result.highlights) {
    item.highlights = result.highlights;
  }
  if (result.metadata) {
    item.metadata = result.metadata;
  }

  return item;
}

function toCitation(citationId: string, result: KnowledgeSearchResult): KnowledgeCitation {
  const citation: KnowledgeCitation = {
    id: citationId,
    chunkId: result.chunk.id,
  };
  const documentId = result.document?.id ?? result.chunk.documentId;
  const sourceId = result.source?.id ?? result.chunk.sourceId ?? result.document?.sourceId;
  const title = result.chunk.title ?? result.document?.title ?? result.source?.name;
  const uri = result.chunk.uri ?? result.document?.uri ?? result.source?.uri;
  const metadata =
    result.metadata ?? result.chunk.metadata ?? result.document?.metadata ?? result.source?.metadata;

  if (documentId) {
    citation.documentId = documentId;
  }
  if (sourceId) {
    citation.sourceId = sourceId;
  }
  if (title) {
    citation.title = title;
  }
  if (uri) {
    citation.uri = uri;
  }
  if (result.score != null) {
    citation.score = result.score;
  }
  if (metadata) {
    citation.metadata = metadata;
  }

  return citation;
}
