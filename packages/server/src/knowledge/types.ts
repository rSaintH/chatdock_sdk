import type { Awaitable, ChatbotRuntimeContext } from "../types.js";

export type KnowledgeMetadata = Record<string, unknown>;

export type KnowledgeSource = {
  id: string;
  name?: string;
  type?: string;
  uri?: string;
  metadata?: KnowledgeMetadata;
};

export type KnowledgeDocument = {
  id: string;
  sourceId?: string;
  title?: string;
  uri?: string;
  metadata?: KnowledgeMetadata;
};

export type KnowledgeChunk = {
  id: string;
  content: string;
  documentId?: string;
  sourceId?: string;
  title?: string;
  uri?: string;
  metadata?: KnowledgeMetadata;
};

export type KnowledgeSearchResult = {
  chunk: KnowledgeChunk;
  document?: KnowledgeDocument;
  source?: KnowledgeSource;
  score?: number;
  highlights?: string[];
  metadata?: KnowledgeMetadata;
};

export type KnowledgeSearchInput<TServices = unknown> = {
  query: string;
  limit: number;
  context: ChatbotRuntimeContext<TServices>;
  filters?: KnowledgeMetadata;
};

export type KnowledgeAdapter<TServices = unknown> = {
  search(input: KnowledgeSearchInput<TServices>): Awaitable<KnowledgeSearchResult[]>;
};

