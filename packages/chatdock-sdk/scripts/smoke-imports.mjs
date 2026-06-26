import assert from "node:assert/strict";

const root = await import("@rsainth/chatdock-sdk");
assert.equal(typeof root.defineTool, "function");
assert.equal(typeof root.toolOk, "function");
assert.equal(typeof root.createConversationHistoryHandler, "function");
assert.equal(typeof root.createInMemoryPersistence, "function");

const server = await import("@rsainth/chatdock-sdk/server");
assert.equal(typeof server.createConversationHistoryHandler, "function");
assert.equal(typeof server.createInMemoryPersistence, "function");

const react = await import("@rsainth/chatdock-sdk/react");
assert.equal(typeof react.ChatbotProvider, "function");
assert.ok(react.ChatbotLauncher);
assert.equal(typeof react.useChatbotConversations, "function");

const next = await import("@rsainth/chatdock-sdk/next");
assert.equal(typeof next.createNextChatbotRoute, "function");
assert.equal(typeof next.createHeaderAuthAdapter, "function");

const supabase = await import("@rsainth/chatdock-sdk/supabase");
assert.equal(typeof supabase.createSupabaseChatbotHandler, "function");
assert.equal(typeof supabase.createSupabasePersistence, "function");

const stylesUrl = await import.meta.resolve("@rsainth/chatdock-sdk/styles.css");
assert.ok(stylesUrl.includes("/styles.css"));

const schemaUrl = await import.meta.resolve("@rsainth/chatdock-sdk/supabase/schema.sql");
assert.ok(schemaUrl.includes("/schema.sql"));

console.log("chatdock-sdk import smoke passed");
