import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeToolCommand } from "./make-tool.js";
import { parseArgs } from "../utils/cli.js";
import { pathExists } from "../utils/fs.js";
import { discoverTools } from "../utils/tools.js";

describe("makeToolCommand", () => {
  it("creates a tool and syncs the generated registry", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-make-tool-"));
    const args = parseArgs(["make-tool", "get-clients", "--cwd", cwd]);

    await makeToolCommand(args);

    const toolPath = path.join(cwd, "chatbot", "tools", "get-clients", "index.ts");
    const generatedPath = path.join(cwd, "chatbot", "tools.generated.ts");
    const tool = await readFile(toolPath, "utf8");
    const generated = await readFile(generatedPath, "utf8");
    const discovered = await discoverTools(cwd);

    expect(tool).toContain('name: "get_clients"');
    expect(tool).toContain("toolOk");
    expect(tool).toContain("input: z.object");
    expect(generated).toContain('path: "./tools/get-clients"');
    expect(discovered.errors).toEqual([]);
    expect(discovered.tools).toHaveLength(1);
  });

  it("adds authorization helpers from flags", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-make-tool-"));
    const args = parseArgs([
      "make-tool",
      "disable-user",
      "--cwd",
      cwd,
      "--destructive",
      "--role",
      "admin",
      "--tenant",
    ]);

    await makeToolCommand(args);

    const tool = await readFile(
      path.join(cwd, "chatbot", "tools", "disable-user", "index.ts"),
      "utf8",
    );

    expect(tool).toContain("destructive: true");
    expect(tool).toContain('allowRoles(["admin"])');
    expect(tool).toContain("allowTenant()");
    expect(tool).toContain("allOfToolAuthorizers");
  });

  it("rejects invalid tool names", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-make-tool-"));
    const args = parseArgs(["make-tool", "get.clients", "--cwd", cwd]);

    await expect(makeToolCommand(args)).rejects.toThrow(
      'Invalid tool name "get.clients". Use letters, numbers, dashes or underscores.',
    );
    expect(await pathExists(path.join(cwd, "chatbot", "tools", "get.clients", "index.ts"))).toBe(false);
  });

  it("rejects an existing tool file unless force is enabled", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-make-tool-"));
    const toolPath = path.join(cwd, "chatbot", "tools", "get-clients", "index.ts");
    await mkdir(path.dirname(toolPath), { recursive: true });
    await writeFile(toolPath, "existing tool", "utf8");
    const args = parseArgs(["make-tool", "get-clients", "--cwd", cwd]);

    await expect(makeToolCommand(args)).rejects.toThrow(
      "chatbot/tools/get-clients/index.ts already exists. Use --force to overwrite it.",
    );
    await expect(readFile(toolPath, "utf8")).resolves.toBe("existing tool");
  });

  it("overwrites an existing tool file with force", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-make-tool-"));
    const toolPath = path.join(cwd, "chatbot", "tools", "get-clients", "index.ts");
    await mkdir(path.dirname(toolPath), { recursive: true });
    await writeFile(toolPath, "existing tool", "utf8");
    const args = parseArgs(["make-tool", "get-clients", "--cwd", cwd, "--force"]);

    await makeToolCommand(args);

    const tool = await readFile(toolPath, "utf8");
    const generated = await readFile(path.join(cwd, "chatbot", "tools.generated.ts"), "utf8");
    expect(tool).toContain('name: "get_clients"');
    expect(tool).not.toBe("existing tool");
    expect(generated).toContain('path: "./tools/get-clients"');
  });

  it("does not write files in dry-run mode", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "chatdock-sdk-make-tool-"));
    const args = parseArgs(["make-tool", "get-clients", "--cwd", cwd, "--dry-run"]);

    await makeToolCommand(args);

    expect(await pathExists(path.join(cwd, "chatbot", "tools", "get-clients", "index.ts"))).toBe(false);
    expect(await pathExists(path.join(cwd, "chatbot", "tools.generated.ts"))).toBe(false);
  });
});
