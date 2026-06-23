import { createNextChatbotRoute } from "@rscheln/chatdock-sdk/next";
import { auth } from "@/chatbot/auth";
import { localModel } from "@/chatbot/local-model";
import { persistence } from "@/chatbot/persistence";
import { systemPrompt } from "@/chatbot/system-prompt";
import { tools } from "@/chatbot/tools.generated";

export const runtime = "nodejs";

export const POST = createNextChatbotRoute({
  requireAuth: true,
  auth,
  persistence,
  model: localModel,
  systemPrompt,
  tools,
  maxHistoryMessages: 20,
});
