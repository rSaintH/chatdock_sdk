import type { ChatbotModel } from "@rscheln/chatdock-sdk";

export const localModel = {
  specificationVersion: "v2",
  provider: "local",
  modelId: "next-basic-local",
  supportedUrls: {},
  async doGenerate() {
    const text = createReply();

    return {
      content: [{ type: "text", text }],
      finishReason: "stop",
      usage: {
        inputTokens: 0,
        outputTokens: text.length,
        totalTokens: text.length,
      },
      warnings: [],
    };
  },
  async doStream() {
    const text = createReply();

    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "text-start", id: "local-text" });
          controller.enqueue({ type: "text-delta", id: "local-text", delta: text });
          controller.enqueue({ type: "text-end", id: "local-text" });
          controller.enqueue({
            type: "finish",
            finishReason: "stop",
            usage: {
              inputTokens: 0,
              outputTokens: text.length,
              totalTokens: text.length,
            },
          });
          controller.close();
        },
      }),
    };
  },
} as unknown as ChatbotModel;

function createReply() {
  return [
    "This is the local mock model from `examples/next-basic`.",
    "It uses the real SDK route, auth adapter, in-memory persistence, system prompt, and tool registry.",
    "Replace `src/chatbot/local-model.ts` with an AI SDK provider model when you are ready to use a real key.",
  ].join(" ");
}
