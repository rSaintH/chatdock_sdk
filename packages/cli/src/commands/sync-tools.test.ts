import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasSnapshotChanged, snapshotToolTree, syncToolsOnce } from "./sync-tools.js";
import { parseArgs } from "../utils/cli.js";

describe("syncToolsOnce", () => {
  it("writes tools.generated.ts under src/chatbot when requested", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-sync-"));
    const toolDir = path.join(cwd, "src", "chatbot", "tools", "get-clients");
    await mkdir(toolDir, { recursive: true });
    await writeFile(
      path.join(toolDir, "index.ts"),
      [
        'import { defineTool } from "@rsainth/chatdock-sdk";',
        "export default defineTool({",
        '  name: "get_clients",',
        '  description: "Get clients",',
        "  inputSchema: {},",
        "  execute: async () => ({ data: { ok: true } }),",
        "});",
      ].join("\n"),
      "utf8",
    );
    const args = parseArgs(["sync-tools", "--cwd", cwd, "--src-dir", "src"]);

    await syncToolsOnce(args);

    const generated = await readFile(path.join(cwd, "src", "chatbot", "tools.generated.ts"), "utf8");
    expect(generated).toContain('path: "./tools/get-clients"');
  });

  it("detects tool tree changes through snapshots", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-sync-"));
    const firstTool = path.join(cwd, "chatbot", "tools", "get-clients");
    await mkdir(firstTool, { recursive: true });
    await writeFile(
      path.join(firstTool, "index.ts"),
      [
        'import { defineTool } from "@rsainth/chatdock-sdk";',
        "export default defineTool({",
        '  name: "get_clients",',
        '  description: "Get clients",',
        "  inputSchema: {},",
        "  execute: async () => ({ data: { ok: true } }),",
        "});",
      ].join("\n"),
      "utf8",
    );

    const before = await snapshotToolTree(cwd, "chatbot");

    const secondTool = path.join(cwd, "chatbot", "tools", "get-orders");
    await mkdir(secondTool, { recursive: true });
    await writeFile(
      path.join(secondTool, "index.ts"),
      [
        'import { defineTool } from "@rsainth/chatdock-sdk";',
        "export default defineTool({",
        '  name: "get_orders",',
        '  description: "Get orders",',
        "  inputSchema: {},",
        "  execute: async () => ({ data: { ok: true } }),",
        "});",
      ].join("\n"),
      "utf8",
    );

    const after = await snapshotToolTree(cwd, "chatbot");
    expect(hasSnapshotChanged(before, after)).toBe(true);
  });
});
