import { describe, expect, it } from "vitest";
import { renderSystemPrompt } from "./defineSystemPrompt.js";

describe("renderSystemPrompt", () => {
  it("joins static and dynamic prompt parts", async () => {
    const prompt = await renderSystemPrompt(
      {
        parts: [
          "Primeira linha",
          async ({ conversationId }) => `Conversation: ${conversationId}`,
        ],
      },
      {
        request: new Request("https://example.com"),
        user: { id: "user_1" },
        conversationId: "conv_1",
        clientContext: {},
        services: {},
      },
    );

    expect(prompt).toContain("Primeira linha");
    expect(prompt).toContain("Conversation: conv_1");
  });
});
