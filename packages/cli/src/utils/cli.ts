export type CliArgs = {
  command?: string;
  cwd: string;
  force: boolean;
  dryRun: boolean;
  flags: Record<string, string | boolean>;
  positional: string[];
};

export type DiagnosticSeverity = "info" | "warn" | "error";

export type CliDiagnostic = {
  severity: DiagnosticSeverity;
  message: string;
};

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

export function parseArgs(argv: string[]): CliArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let cwd = process.cwd();
  let force = false;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--cwd") {
      const value = argv[index + 1];
      if (!value) {
        throw new CliError("--cwd requires a path.");
      }
      cwd = value;
      flags.cwd = value;
      index += 1;
      continue;
    }

    if (arg === "--force") {
      force = true;
      flags.force = true;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      flags["dry-run"] = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      positional.push("help");
      continue;
    }

    if (arg.startsWith("--")) {
      const [rawName, inlineValue] = arg.slice(2).split("=", 2);
      if (!rawName) {
        throw new CliError(`Invalid flag "${arg}".`);
      }

      const next = argv[index + 1];
      const consumesNext = inlineValue == null && next != null && !next.startsWith("-");
      const value = consumesNext ? next : inlineValue ?? true;
      flags[rawName] = value;
      if (consumesNext) {
        index += 1;
      }
      continue;
    }

    positional.push(arg);
  }

  return {
    command: positional[0],
    cwd,
    force,
    dryRun,
    flags,
    positional: positional.slice(1),
  };
}

export function printHelp() {
  console.log(`chatdock-sdk

Usage:
  chatdock-sdk init [--cwd <path>] [--next] [--supabase] [--src-dir <path>] [--app-dir <path>] [--force] [--dry-run]
  chatdock-sdk make-tool <name> [--cwd <path>] [--destructive] [--role <role>] [--tenant] [--dry-run]
  chatdock-sdk sync-tools [--cwd <path>] [--watch] [--dry-run]
  chatdock-sdk watch-tools [--cwd <path>] [--dry-run]
  chatdock-sdk doctor [--cwd <path>]

Commands:
  init         Create the recommended chatbot/ scaffold and generated tools file.
  make-tool    Create a new chatbot tool file and sync the generated registry.
  sync-tools   Read chatbot/tools/**/index.ts and generate chatbot/tools.generated.ts.
  watch-tools  Watch chatbot/tools/**/index.ts and keep chatbot/tools.generated.ts in sync.
  doctor       Check project shape, dependencies, generated tools and risky frontend imports.
`);
}

export function printDiagnostic(diagnostic: CliDiagnostic) {
  const prefix = diagnostic.severity === "info" ? "Info" : diagnostic.severity === "warn" ? "Warning" : "Error";
  const message = `${prefix}: ${diagnostic.message}`;

  if (diagnostic.severity === "error") {
    console.error(message);
    return;
  }

  if (diagnostic.severity === "warn") {
    console.warn(message);
    return;
  }

  console.log(message);
}
