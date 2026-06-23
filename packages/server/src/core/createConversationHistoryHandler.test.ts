import type { PersistenceAdapter } from "../types.js";
import { describe, expect, it } from "vitest";
import { createInMemoryPersistence } from "../adapters/inMemoryPersistence.js";
import { createConversationHistoryHandler } from "./createConversationHistoryHandler.js";

describe("createConversationHistoryHandler", () => {
  it("manages authenticated user conversations", async () => {
    const persistence = createInMemoryPersistence();
    const user = { id: "user_1", tenantId: "tenant_1" };
    const conversation = await persistence.getOrCreateConversation({
      user,
      context: { pathname: "/clientes" },
    });
    await persistence.saveMessage({
      conversationId: conversation.id,
      user,
      message: { id: "msg_1", role: "user", parts: [{ type: "text", text: "hello client" }] } as never,
    });
    await persistence.getOrCreateConversation({
      user: { id: "user_2", tenantId: "tenant_1" },
      context: { pathname: "/outro" },
    });

    const handler = createConversationHistoryHandler({
      persistence,
      basePath: "/api/conversations",
      authAdapter: {
        authenticate: async () => user,
      },
    });

    const listResponse = await handler(request("/api/conversations"));
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as { conversations: { id: string }[] };
    expect(listed.conversations).toEqual([{ ...conversation, updatedAt: expect.any(String), createdAt: expect.any(String) }]);

    const searchResponse = await handler(request("/api/conversations?search=client"));
    expect(searchResponse.status).toBe(200);
    const searched = (await searchResponse.json()) as { conversations: { id: string }[] };
    expect(searched.conversations).toHaveLength(1);
    expect(searched.conversations[0]?.id).toBe(conversation.id);

    const loadResponse = await handler(request(`/api/conversations/${conversation.id}`));
    expect(loadResponse.status).toBe(200);
    const loaded = (await loadResponse.json()) as { conversation: { id: string; messages: { id: string }[] } };
    expect(loaded.conversation.id).toBe(conversation.id);
    expect(loaded.conversation.messages).toEqual([{ id: "msg_1", role: "user", parts: [{ type: "text", text: "hello client" }] }]);

    const renameResponse = await handler(
      request(`/api/conversations/${conversation.id}`, {
        method: "PATCH",
        body: { title: "Atendimento VIP" },
      }),
    );
    expect(renameResponse.status).toBe(200);
    const renamed = (await renameResponse.json()) as { conversation: { title?: string } };
    expect(renamed.conversation.title).toBe("Atendimento VIP");

    const deleteResponse = await handler(
      request(`/api/conversations/${conversation.id}`, {
        method: "DELETE",
      }),
    );
    expect(deleteResponse.status).toBe(204);

    const missingResponse = await handler(request(`/api/conversations/${conversation.id}`));
    expect(missingResponse.status).toBe(404);
  });

  it("requires authentication", async () => {
    const handler = createConversationHistoryHandler({
      persistence: createInMemoryPersistence(),
      authAdapter: {
        authenticate: async () => null,
      },
    });

    const response = await handler(request("/api/conversations"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Authentication required." });
  });

  it("returns 501 when the persistence adapter does not implement a requested operation", async () => {
    const persistence = createRequiredOnlyPersistence();
    const handler = createConversationHistoryHandler({
      persistence,
      basePath: "/api/conversations",
      authAdapter: {
        authenticate: async () => ({ id: "user_1" }),
      },
    });

    await expectStatusAndError(
      handler(request("/api/conversations")),
      501,
      "Persistence adapter does not implement listConversations.",
    );
    await expectStatusAndError(
      handler(request("/api/conversations?search=client")),
      501,
      "Persistence adapter does not implement searchConversations.",
    );
    await expectStatusAndError(
      handler(request("/api/conversations/conv_1")),
      501,
      "Persistence adapter does not implement loadConversation.",
    );
    await expectStatusAndError(
      handler(request("/api/conversations/conv_1", { method: "PATCH" })),
      501,
      "Persistence adapter does not implement updateConversation.",
    );
    await expectStatusAndError(
      handler(request("/api/conversations/conv_1", { method: "DELETE" })),
      501,
      "Persistence adapter does not implement deleteConversation.",
    );
  });
});

function request(path: string, init: { method?: string; body?: unknown } = {}): Request {
  return new Request(`https://example.com${path}`, {
    method: init.method ?? "GET",
    ...(init.body
      ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(init.body),
        }
      : {}),
  });
}

async function expectStatusAndError(responsePromise: Promise<Response>, status: number, error: string): Promise<void> {
  const response = await responsePromise;
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toEqual({ error });
}

function createRequiredOnlyPersistence(): PersistenceAdapter {
  return {
    getOrCreateConversation: async () => ({
      id: "conv_1",
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    loadMessages: async () => [],
    saveMessage: async () => undefined,
  };
}
