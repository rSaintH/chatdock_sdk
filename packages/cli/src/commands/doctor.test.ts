import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { doctorCommand } from "./doctor.js";
import { initCommand } from "./init.js";
import { parseArgs } from "../utils/cli.js";

describe("doctorCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns about incompatible dependency versions and missing provider packages", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-doctor-"));
    await writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({
        dependencies: {
          ai: "^5.0.0",
          "@ai-sdk/react": "^2.0.0",
          react: "^17.0.0",
        },
      }),
      "utf8",
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await doctorCommand(parseArgs(["doctor", "--cwd", cwd]));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Dependency "ai" should target major 6'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Dependency "@ai-sdk/react" should target major 3'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Dependency "react" should target React 18 or newer'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("No AI SDK provider dependency was found"));
  });

  it("fails when tool validation has errors", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-doctor-"));
    await writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({
        dependencies: {
          ai: "^6.0.0",
          "@ai-sdk/react": "^3.0.0",
          "@ai-sdk/openai": "^3.0.0",
          react: "^19.0.0",
        },
      }),
      "utf8",
    );
    const toolDir = path.join(cwd, "chatbot", "tools", "broken-tool");
    await mkdir(toolDir, { recursive: true });
    await writeFile(
      path.join(toolDir, "index.ts"),
      [
        'import { defineTool } from "@rscheln/chatdock-sdk";',
        "export default defineTool({",
        '  name: "broken-tool",',
        '  description: "Broken tool",',
        "  inputSchema: {},",
        "});",
      ].join("\n"),
      "utf8",
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(doctorCommand(parseArgs(["doctor", "--cwd", cwd]))).rejects.toThrow(
      /critical issues were found/,
    );
  });

  it("fails when dangerous tools do not define an authorizer", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-doctor-"));
    await writeValidPackageJson(cwd);
    await mkdir(path.join(cwd, "chatbot"), { recursive: true });
    await writeFile(path.join(cwd, "chatbot", "system-prompt.ts"), "export const systemPrompt = '';\n", "utf8");
    const toolDir = path.join(cwd, "chatbot", "tools", "disable-user");
    await mkdir(toolDir, { recursive: true });
    await writeFile(
      path.join(toolDir, "index.ts"),
      [
        'import { defineTool } from "@rscheln/chatdock-sdk";',
        "export default defineTool({",
        '  name: "disable_user",',
        '  description: "Disables a user account.",',
        "  inputSchema: {},",
        "  destructive: true,",
        "  execute: async () => ({}),",
        "});",
      ].join("\n"),
      "utf8",
    );
    await writeFile(path.join(cwd, "chatbot", "tools.generated.ts"), "export const tools = [];\n", "utf8");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(doctorCommand(parseArgs(["doctor", "--cwd", cwd]))).rejects.toThrow(
      /critical issues were found/,
    );

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining(
        'chatbot/tools/disable-user/index.ts marks a tool as destructive, dangerous or confirmation-gated but does not define "authorize"',
      ),
    );
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining("chatbot/tools/disable-user/index.ts"),
    );
  });

  it("warns when chat routes keep auth but omit rate limiting", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-doctor-"));
    await writeValidPackageJson(cwd);
    await mkdir(path.join(cwd, "chatbot"), { recursive: true });
    await writeFile(path.join(cwd, "chatbot", "system-prompt.ts"), "export const systemPrompt = '';\n", "utf8");
    await mkdir(path.join(cwd, "chatbot", "tools"), { recursive: true });
    await writeFile(path.join(cwd, "chatbot", "tools.generated.ts"), "export const tools = [];\n", "utf8");
    const routeDir = path.join(cwd, "app", "api", "chat");
    await mkdir(routeDir, { recursive: true });
    await writeFile(
      path.join(routeDir, "route.ts"),
      [
        'import { createNextChatbotRoute } from "@rscheln/chatdock-sdk/next";',
        "export const POST = createNextChatbotRoute({",
        "  requireAuth: true,",
        "  systemPrompt: 'Hello',",
        "  tools: [],",
        "});",
      ].join("\n"),
      "utf8",
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(doctorCommand(parseArgs(["doctor", "--cwd", cwd]))).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('app/api/chat/route.ts uses createNextChatbotRoute/createSupabaseChatbotHandler without an apparent "rateLimitAdapter"'),
    );
    expect(error).not.toHaveBeenCalledWith(
      expect.stringContaining('app/api/chat/route.ts uses createNextChatbotRoute/createSupabaseChatbotHandler without "requireAuth: true"'),
    );
  });

  it("fails when chat history routes omit auth adapters", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-doctor-"));
    await writeValidPackageJson(cwd);
    await mkdir(path.join(cwd, "chatbot"), { recursive: true });
    await writeFile(path.join(cwd, "chatbot", "system-prompt.ts"), "export const systemPrompt = '';\n", "utf8");
    await mkdir(path.join(cwd, "chatbot", "tools"), { recursive: true });
    await writeFile(path.join(cwd, "chatbot", "tools.generated.ts"), "export const tools = [];\n", "utf8");
    const historyRouteDir = path.join(cwd, "app", "api", "chat-history", "[[...conversationId]]");
    await mkdir(historyRouteDir, { recursive: true });
    await writeFile(
      path.join(historyRouteDir, "route.ts"),
      [
        'import { createConversationHistoryHandler } from "@rscheln/chatdock-sdk";',
        "export const handler = createConversationHistoryHandler({",
        "  persistence: {},",
        "  basePath: '/api/chat-history',",
        "});",
        "export { handler as DELETE, handler as GET, handler as PATCH };",
      ].join("\n"),
      "utf8",
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(doctorCommand(parseArgs(["doctor", "--cwd", cwd]))).rejects.toThrow(
      /critical issues were found/,
    );

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining(
        'app/api/chat-history/[[...conversationId]]/route.ts uses createConversationHistoryHandler without an "authAdapter"',
      ),
    );
  });

  it("accepts the scaffold produced by init with only soft warnings", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-doctor-init-"));
    await initCommand(parseArgs(["init", "--cwd", cwd, "--next", "--supabase"]));
    await writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({
        dependencies: {
          ai: "^6.0.0",
          "@ai-sdk/react": "^3.0.0",
          "@ai-sdk/openai": "^3.0.0",
          react: "^19.0.0",
        },
      }),
      "utf8",
    );

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(doctorCommand(parseArgs(["doctor", "--cwd", cwd]))).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('app/api/chat/route.ts uses createNextChatbotRoute/createSupabaseChatbotHandler without an apparent "rateLimitAdapter"'),
    );
  });
});

async function writeValidPackageJson(cwd: string) {
  await writeFile(
    path.join(cwd, "package.json"),
    JSON.stringify({
      dependencies: {
        ai: "^6.0.0",
        "@ai-sdk/react": "^3.0.0",
        "@ai-sdk/openai": "^3.0.0",
        react: "^19.0.0",
      },
    }),
    "utf8",
  );
}
