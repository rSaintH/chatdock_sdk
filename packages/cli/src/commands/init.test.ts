import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "./init.js";
import { parseArgs } from "../utils/cli.js";
import { pathExists } from "../utils/fs.js";

describe("initCommand", () => {
  it("keeps the default chatbot scaffold", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-init-"));
    const args = parseArgs(["init", "--cwd", cwd]);

    await initCommand(args);

    expect(await pathExists(path.join(cwd, "chatbot", "system-prompt.ts"))).toBe(true);
    expect(await pathExists(path.join(cwd, "chatbot", "local-model.ts"))).toBe(true);
    expect(await pathExists(path.join(cwd, "chatbot", "tools", "example-tool", "index.ts"))).toBe(true);
    expect(await pathExists(path.join(cwd, "chatbot", "tools.generated.ts"))).toBe(true);
  });

  it("creates the Next.js and Supabase scaffold", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-init-"));
    const args = parseArgs(["init", "--cwd", cwd, "--next", "--supabase"]);

    await initCommand(args);

    const chatRoute = await readFile(path.join(cwd, "app", "api", "chat", "route.ts"), "utf8");
    const historyRoute = await readFile(
      path.join(cwd, "app", "api", "chat-history", "[[...conversationId]]", "route.ts"),
      "utf8",
    );

    expect(await pathExists(path.join(cwd, "src", "chatbot", "system-prompt.ts"))).toBe(true);
    expect(await pathExists(path.join(cwd, "src", "chatbot", "tools.generated.ts"))).toBe(true);
    expect(await pathExists(path.join(cwd, "src", "chatbot", "local-model.ts"))).toBe(true);
    expect(chatRoute).toContain('from "@/chatbot/auth"');
    expect(chatRoute).toContain("model: chatbotConfig.model");
    expect(chatRoute).toContain("maxHistoryMessages: chatbotConfig.maxHistoryMessages");
    expect(historyRoute).toContain('basePath: "/api/chat-history"');
    expect(await pathExists(path.join(cwd, "supabase", "migrations"))).toBe(true);
  });

  it("does not write files in dry-run mode", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-init-"));
    const args = parseArgs(["init", "--cwd", cwd, "--next", "--supabase", "--dry-run"]);

    await initCommand(args);

    expect(await pathExists(path.join(cwd, "src", "chatbot", "system-prompt.ts"))).toBe(false);
    expect(await pathExists(path.join(cwd, "app", "api", "chat", "route.ts"))).toBe(false);
  });

  it("generates the system prompt scaffold with parts", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-init-"));
    const args = parseArgs(["init", "--cwd", cwd]);

    await initCommand(args);

    const systemPrompt = await readFile(path.join(cwd, "chatbot", "system-prompt.ts"), "utf8");
    expect(systemPrompt).toContain("defineSystemPrompt({");
    expect(systemPrompt).toContain("parts: [");
  });

  it("rejects existing files unless force is enabled", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-init-"));
    const existingPath = path.join(cwd, "chatbot", "system-prompt.ts");
    await mkdir(path.dirname(existingPath), { recursive: true });
    await writeFile(existingPath, "existing prompt", "utf8");
    const args = parseArgs(["init", "--cwd", cwd]);

    await expect(initCommand(args)).rejects.toThrow(
      "chatbot/system-prompt.ts already exists. Use --force to overwrite generated starter files.",
    );
    await expect(readFile(existingPath, "utf8")).resolves.toBe("existing prompt");
  });
});
