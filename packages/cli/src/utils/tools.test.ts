import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverTools, generateToolsFile } from "./tools.js";

describe("discoverTools", () => {
  it("reads tool metadata from chatbot/tools/**/index.ts", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-tools-"));
    const toolDir = path.join(cwd, "chatbot", "tools", "buscar-clientes");
    await mkdir(toolDir, { recursive: true });
    await writeFile(
      path.join(toolDir, "index.ts"),
      [
        'import { defineTool } from "@rsainth/chatdock-sdk";',
        "export default defineTool({",
        '  name: "buscar_clientes",',
        '  description: "Busca clientes",',
        "  inputSchema: {},",
        "  execute: async () => ({ data: { ok: true } }),",
        "});",
      ].join("\n"),
      "utf8",
    );

    const result = await discoverTools(cwd);

    expect(result.errors).toEqual([]);
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]?.name).toBe("buscar_clientes");
    expect(generateToolsFile(result.tools)).toContain('path: "./tools/buscar-clientes"');
  });

  it("reads tool metadata from a custom chatbot root", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-tools-"));
    const toolDir = path.join(cwd, "src", "chatbot", "tools", "get-clients");
    await mkdir(toolDir, { recursive: true });
    await writeFile(
      path.join(toolDir, "index.ts"),
      [
        'import { defineTool } from "@rsainth/chatdock-sdk";',
        "export default defineTool({",
        '  name: "get_clients",',
        '  description: "Get clients",',
        "  input: {},",
        "  execute: async () => ({ data: { ok: true } }),",
        "});",
      ].join("\n"),
      "utf8",
    );

    const result = await discoverTools(cwd, { chatbotRoot: "src/chatbot" });

    expect(result.errors).toEqual([]);
    expect(result.tools[0]?.importPath).toBe("./tools/get-clients");
  });

  it("reports invalid tool files and duplicate names", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-tools-"));
    await writeTool(cwd, "first", [
      'import { defineTool } from "@rsainth/chatdock-sdk";',
      "export default defineTool({",
      '  name: "duplicate_name",',
      '  description: "First",',
      "  inputSchema: {},",
      "  execute: async () => ({ data: { ok: true } }),",
      "});",
    ]);
    await writeTool(cwd, "second", [
      'import { defineTool } from "@rsainth/chatdock-sdk";',
      "export default defineTool({",
      '  name: "duplicate_name",',
      '  description: "Second",',
      "  inputSchema: {},",
      "  execute: async () => ({ data: { ok: true } }),",
      "});",
    ]);
    await writeTool(cwd, "missing-input", [
      'import { defineTool } from "@rsainth/chatdock-sdk";',
      "export default defineTool({",
      '  name: "missing_input",',
      '  description: "Missing input",',
      "  execute: async () => ({ data: { ok: true } }),",
      "});",
    ]);
    await writeTool(cwd, "bad-name", [
      'import { defineTool } from "@rsainth/chatdock-sdk";',
      "export default defineTool({",
      '  name: "bad-name",',
      '  description: "Bad name",',
      "  inputSchema: {},",
      "  execute: async () => ({ data: { ok: true } }),",
      "});",
    ]);
    await writeTool(cwd, "no-default", [
      'import { defineTool } from "@rsainth/chatdock-sdk";',
      "export const tool = defineTool({",
      '  name: "no_default",',
      '  description: "No default",',
      "  inputSchema: {},",
      "  execute: async () => ({ data: { ok: true } }),",
      "});",
    ]);

    const result = await discoverTools(cwd);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('duplicate tool name "duplicate_name"'),
        expect.stringContaining('missing required property "inputSchema"'),
        expect.stringContaining('tool name "bad-name" must be snake_case'),
        expect.stringContaining("expected a default export"),
      ]),
    );
  });
});

async function writeTool(cwd: string, slug: string, lines: string[]) {
  const toolDir = path.join(cwd, "chatbot", "tools", slug);
  await mkdir(toolDir, { recursive: true });
  await writeFile(path.join(toolDir, "index.ts"), lines.join("\n"), "utf8");
}
