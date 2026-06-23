import { describe, expect, it } from "vitest";
import { parseArgs } from "./cli.js";

describe("parseArgs", () => {
  it("parses flags and positional args", () => {
    const args = parseArgs(["sync-tools", "--cwd", "/tmp/app", "--force", "--dry-run", "extra"]);

    expect(args.command).toBe("sync-tools");
    expect(args.cwd).toBe("/tmp/app");
    expect(args.force).toBe(true);
    expect(args.dryRun).toBe(true);
    expect(args.flags).toEqual({
      cwd: "/tmp/app",
      force: true,
      "dry-run": true,
    });
    expect(args.positional).toEqual(["extra"]);
  });

  it("parses named flags with values", () => {
    const args = parseArgs([
      "init",
      "--next",
      "--supabase",
      "--src-dir",
      "src",
      "--app-dir=app",
    ]);

    expect(args.command).toBe("init");
    expect(args.flags.next).toBe(true);
    expect(args.flags.supabase).toBe(true);
    expect(args.flags["src-dir"]).toBe("src");
    expect(args.flags["app-dir"]).toBe("app");
  });
});
