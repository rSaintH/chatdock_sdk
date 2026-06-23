import { createInMemoryPersistence } from "../adapters/inMemoryPersistence.js";
import type {
  AuthAdapter,
  Awaitable,
  ChatbotHandler,
  ChatbotRequestBody,
  ChatbotUser,
  PersistenceAdapter,
} from "../types.js";

export type ConversationHistoryHandlerOptions<TServices = unknown> = {
  authAdapter?: AuthAdapter<TServices>;
  persistence?: PersistenceAdapter;
  services?: TServices;
  headers?: HeadersInit;
  basePath?: string;
  getConversationId?: (request: Request) => Awaitable<string | null | undefined>;
  defaultLimit?: number;
  maxLimit?: number;
};

type RenameConversationBody = {
  title: string;
};

const defaultLimit = 50;
const defaultMaxLimit = 100;
const allowedMethods = "GET, PATCH, DELETE";
const collectionSegments = new Set(["conversations", "conversation-history"]);

export function createConversationHistoryHandler<TServices = unknown>(
  options: ConversationHistoryHandlerOptions<TServices>,
): ChatbotHandler {
  const services = (options.services ?? {}) as TServices;
  const persistence = options.persistence ?? createInMemoryPersistence();
  const maxLimit = options.maxLimit ?? defaultMaxLimit;
  const initialLimit = options.defaultLimit ?? defaultLimit;

  return async function conversationHistoryHandler(request: Request): Promise<Response> {
    if (!isAllowedMethod(request.method)) {
      return jsonResponse({ error: "Method not allowed" }, 405, { Allow: allowedMethods }, options.headers);
    }

    const user = await authenticateRequest({
      authAdapter: options.authAdapter,
      request,
      services,
    });

    if (!user) {
      return jsonResponse({ error: "Authentication required." }, 401, undefined, options.headers);
    }

    const conversationId = await resolveConversationId(request, options);

    if (request.method === "GET") {
      return handleGet({
        conversationId,
        persistence,
        request,
        user,
        defaultLimit: initialLimit,
        maxLimit,
        headers: options.headers,
      });
    }

    if (!conversationId) {
      return jsonResponse({ error: "Conversation id is required." }, 400, undefined, options.headers);
    }

    if (request.method === "PATCH") {
      return handlePatch({
        conversationId,
        persistence,
        request,
        user,
        headers: options.headers,
      });
    }

    return handleDelete({
      conversationId,
      persistence,
      user,
      headers: options.headers,
    });
  };
}

async function authenticateRequest<TServices>(input: {
  authAdapter: AuthAdapter<TServices> | undefined;
  request: Request;
  services: TServices;
}): Promise<ChatbotUser | null> {
  if (!input.authAdapter) {
    return null;
  }

  return input.authAdapter.authenticate({
    request: input.request,
    body: {} as ChatbotRequestBody,
    services: input.services,
  });
}

async function handleGet(input: {
  conversationId: string | undefined;
  persistence: PersistenceAdapter;
  request: Request;
  user: ChatbotUser;
  defaultLimit: number;
  maxLimit: number;
  headers: HeadersInit | undefined;
}): Promise<Response> {
  if (input.conversationId) {
    if (!input.persistence.loadConversation) {
      return notImplemented("loadConversation", input.headers);
    }

    const conversation = await input.persistence.loadConversation({
      conversationId: input.conversationId,
      user: input.user,
    });

    if (!conversation) {
      return jsonResponse({ error: "Conversation not found." }, 404, undefined, input.headers);
    }

    return jsonResponse({ conversation }, 200, undefined, input.headers);
  }

  const url = new URL(input.request.url);
  const query = (url.searchParams.get("q") ?? url.searchParams.get("search"))?.trim();
  let limit: number;
  try {
    limit = parseLimit(url.searchParams.get("limit"), input.defaultLimit, input.maxLimit);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Invalid limit." }, 400, undefined, input.headers);
  }

  if (query) {
    if (!input.persistence.searchConversations) {
      return notImplemented("searchConversations", input.headers);
    }

    const conversations = await input.persistence.searchConversations({
      user: input.user,
      query,
      limit,
    });
    return jsonResponse({ conversations }, 200, undefined, input.headers);
  }

  if (!input.persistence.listConversations) {
    return notImplemented("listConversations", input.headers);
  }

  const conversations = await input.persistence.listConversations({
    user: input.user,
    limit,
  });
  return jsonResponse({ conversations }, 200, undefined, input.headers);
}

async function handlePatch(input: {
  conversationId: string;
  persistence: PersistenceAdapter;
  request: Request;
  user: ChatbotUser;
  headers: HeadersInit | undefined;
}): Promise<Response> {
  if (!input.persistence.updateConversation) {
    return notImplemented("updateConversation", input.headers);
  }

  let body: RenameConversationBody;
  try {
    body = await readRenameBody(input.request);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Invalid JSON body" }, 400, undefined, input.headers);
  }

  const conversation = await input.persistence.updateConversation({
    conversationId: input.conversationId,
    user: input.user,
    title: body.title,
  });

  if (!conversation) {
    return jsonResponse({ error: "Conversation not found." }, 404, undefined, input.headers);
  }

  return jsonResponse({ conversation }, 200, undefined, input.headers);
}

async function handleDelete(input: {
  conversationId: string;
  persistence: PersistenceAdapter;
  user: ChatbotUser;
  headers: HeadersInit | undefined;
}): Promise<Response> {
  if (!input.persistence.deleteConversation) {
    return notImplemented("deleteConversation", input.headers);
  }

  const deleted = await input.persistence.deleteConversation({
    conversationId: input.conversationId,
    user: input.user,
  });

  if (deleted === false) {
    return jsonResponse({ error: "Conversation not found." }, 404, undefined, input.headers);
  }

  return new Response(null, {
    status: 204,
    headers: headersToRecord(input.headers),
  });
}

async function readRenameBody(request: Request): Promise<RenameConversationBody> {
  const contentType = request.headers.get("content-type");
  if (contentType && !contentType.includes("application/json")) {
    throw new Error("Content-Type must be application/json.");
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new Error("Invalid JSON body.");
  }

  if (!isRecord(value)) {
    throw new Error("JSON body must be an object.");
  }

  const rawTitle = typeof value.title === "string" ? value.title : typeof value.name === "string" ? value.name : undefined;
  const title = rawTitle?.trim();

  if (!title) {
    throw new Error("Request body must include a non-empty title string.");
  }

  return { title };
}

async function resolveConversationId<TServices>(
  request: Request,
  options: ConversationHistoryHandlerOptions<TServices>,
): Promise<string | undefined> {
  if (options.getConversationId) {
    return normalizeConversationId(await options.getConversationId(request));
  }

  const url = new URL(request.url);
  const queryId = normalizeConversationId(url.searchParams.get("conversationId") ?? url.searchParams.get("id"));
  if (queryId) {
    return queryId;
  }

  const basePathId = resolveConversationIdFromBasePath(url.pathname, options.basePath);
  if (basePathId) {
    return basePathId;
  }

  return resolveConversationIdFromCollectionPath(url.pathname);
}

function resolveConversationIdFromBasePath(pathname: string, basePath: string | undefined): string | undefined {
  if (!basePath) {
    return undefined;
  }

  const normalizedBasePath = normalizePath(basePath);
  const normalizedPathname = normalizePath(pathname);

  if (normalizedPathname === normalizedBasePath) {
    return undefined;
  }

  if (!normalizedPathname.startsWith(`${normalizedBasePath}/`)) {
    return undefined;
  }

  const [segment] = normalizedPathname.slice(normalizedBasePath.length + 1).split("/");
  return normalizeConversationId(decodePathSegment(segment));
}

function resolveConversationIdFromCollectionPath(pathname: string): string | undefined {
  const segments = normalizePath(pathname).split("/").filter(Boolean);
  const collectionIndex = segments.findIndex((segment) => collectionSegments.has(segment));
  if (collectionIndex < 0 || collectionIndex + 2 !== segments.length) {
    return undefined;
  }

  return normalizeConversationId(decodePathSegment(segments[collectionIndex + 1]));
}

function normalizePath(pathname: string): string {
  const withLeadingSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, "") : withLeadingSlash;
}

function decodePathSegment(segment: string | undefined): string | undefined {
  if (!segment) {
    return undefined;
  }

  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function normalizeConversationId(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseLimit(rawLimit: string | null, fallback: number, maxLimit: number): number {
  if (!rawLimit) {
    return clampLimit(fallback, maxLimit);
  }

  const parsed = Number(rawLimit);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Limit must be a positive integer.");
  }

  return clampLimit(parsed, maxLimit);
}

function clampLimit(value: number, maxLimit: number): number {
  return Math.min(Math.max(1, value), Math.max(1, maxLimit));
}

function notImplemented(method: string, headers?: HeadersInit): Response {
  return jsonResponse(
    { error: `Persistence adapter does not implement ${method}.` },
    501,
    undefined,
    headers,
  );
}

function isAllowedMethod(method: string): boolean {
  return method === "GET" || method === "PATCH" || method === "DELETE";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonResponse(body: unknown, status: number, headers?: HeadersInit, baseHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headersToRecord(baseHeaders),
      ...headersToRecord(headers),
    },
  });
}

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }

  return Object.fromEntries(new Headers(headers).entries());
}
