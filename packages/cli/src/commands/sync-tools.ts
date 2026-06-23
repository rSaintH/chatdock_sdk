import path from "node:path";
import { stat } from "node:fs/promises";
import { CliArgs, CliError } from "../utils/cli.js";
import { listFilesRecursive, pathExists, writeFileIfChanged } from "../utils/fs.js";
import { discoverTools, generateToolsFile, inferChatbotRoot } from "../utils/tools.js";

const watchDebounceMs = 200;
const watchPollMs = 250;

export type ToolTreeSnapshot = Map<string, string>;

export async function syncToolsCommand(args: CliArgs) {
  if (args.flags.watch === true) {
    await watchTools(args);
    return;
  }

  await syncToolsOnce(args);
}

export async function syncToolsOnce(args: CliArgs) {
  const chatbotRoot = await inferChatbotRoot(args.cwd, args);
  const result = await discoverTools(args.cwd, { chatbotRoot });

  for (const warning of result.warnings) {
    console.warn(`Warning: ${warning}`);
  }

  if (result.errors.length > 0) {
    throw new CliError(`Tool validation failed:\n${result.errors.map((error) => `- ${error}`).join("\n")}`);
  }

  const outputPath = path.join(args.cwd, chatbotRoot, "tools.generated.ts");
  const status = await writeFileIfChanged(outputPath, generateToolsFile(result.tools), args.dryRun);
  const suffix = args.dryRun ? " (dry run)" : "";
  const displayPath = toPosix(path.join(chatbotRoot, "tools.generated.ts"));

  console.log(`${status}: ${displayPath}${suffix}`);
  console.log(`synced ${result.tools.length} tool${result.tools.length === 1 ? "" : "s"}`);
}

async function watchTools(args: CliArgs) {
  const chatbotRoot = await inferChatbotRoot(args.cwd, args);
  const chatbotPath = path.join(args.cwd, chatbotRoot);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let rerunRequested = false;
  let lastSnapshot = await snapshotToolTree(args.cwd, chatbotRoot);

  async function run() {
    if (running) {
      rerunRequested = true;
      return;
    }

    running = true;
    do {
      rerunRequested = false;
      await runWatchSync(args);
    } while (rerunRequested);
    running = false;
  }

  function schedule() {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      void run();
    }, watchDebounceMs);
  }

  async function pollForChanges() {
    const nextSnapshot = await snapshotToolTree(args.cwd, chatbotRoot);
    if (hasSnapshotChanged(lastSnapshot, nextSnapshot)) {
      lastSnapshot = nextSnapshot;
      schedule();
    }
  }

  await runWatchSync(args);

  if (!(await pathExists(chatbotPath))) {
    console.log(`watching ${toPosix(chatbotRoot)} (directory will be created by init or make-tool)`);
  } else {
    console.log(`watching ${toPosix(path.join(chatbotRoot, "tools"))}`);
  }

  const poller = setInterval(() => {
    void pollForChanges().catch((error) => {
      console.error(`watch error: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, watchPollMs);

  await new Promise<void>((resolve) => {
    let settled = false;
    const stop = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(poller);
      if (timer) {
        clearTimeout(timer);
      }
      resolve();
    };

    process.once("SIGINT", () => {
      stop();
    });
    process.once("SIGTERM", () => {
      stop();
    });
  });
}

async function runWatchSync(args: CliArgs) {
  try {
    await syncToolsOnce(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("waiting for changes...");
  }
}

function toPosix(filePath: string) {
  return filePath.split(path.sep).join("/");
}

export async function snapshotToolTree(cwd: string, chatbotRoot: string) {
  const toolsRoot = path.join(cwd, chatbotRoot, "tools");
  const snapshot: ToolTreeSnapshot = new Map();
  const files = (await listFilesRecursive(toolsRoot))
    .filter((filePath) => filePath.endsWith(`${path.sep}index.ts`))
    .sort((left, right) => left.localeCompare(right));

  for (const filePath of files) {
    const fileStat = await stat(filePath);
    snapshot.set(path.relative(cwd, filePath).split(path.sep).join("/"), `${fileStat.size}:${fileStat.mtimeMs}`);
  }

  return snapshot;
}

export function hasSnapshotChanged(previous: ToolTreeSnapshot, next: ToolTreeSnapshot) {
  if (previous.size !== next.size) {
    return true;
  }

  for (const [filePath, fingerprint] of next) {
    if (previous.get(filePath) !== fingerprint) {
      return true;
    }
  }

  return false;
}
