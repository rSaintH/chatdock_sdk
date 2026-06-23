import { describe, expect, it } from "vitest";
import { createInMemoryPersistence } from "./inMemoryPersistence.js";

describe("createInMemoryPersistence", () => {
  it("stores and updates conversations and messages", async () => {
    const persistence = createInMemoryPersistence();
    const conversation = await persistence.getOrCreateConversation({
      user: { id: "user_1" },
      context: { pathname: "/clientes" },
    });

    await persistence.saveMessage({
      conversationId: conversation.id,
      user: { id: "user_1" },
      message: { id: "msg_1", role: "user", parts: [{ type: "text", text: "oi" }] } as never,
    });

    const messages = await persistence.loadMessages({ conversationId: conversation.id, user: { id: "user_1" } });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe("msg_1");
  });
});
