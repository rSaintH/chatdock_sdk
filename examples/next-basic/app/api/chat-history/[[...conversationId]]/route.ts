import { createConversationHistoryHandler } from "@rsainth/chatdock-sdk";
import { auth } from "@/chatbot/auth";
import { persistence } from "@/chatbot/persistence";

export const runtime = "nodejs";

const handler = createConversationHistoryHandler({
  authAdapter: auth,
  persistence,
  basePath: "/api/chat-history",
});

export { handler as DELETE, handler as GET, handler as PATCH };
