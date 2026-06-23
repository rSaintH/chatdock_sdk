#!/usr/bin/env node
import { doctorCommand } from "./commands/doctor.js";
import { initCommand } from "./commands/init.js";
import { makeToolCommand } from "./commands/make-tool.js";
import { syncToolsCommand } from "./commands/sync-tools.js";
import { CliError, parseArgs, printHelp } from "./utils/cli.js";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  switch (args.command) {
    case "init":
      await initCommand(args);
      break;
    case "make-tool":
      await makeToolCommand(args);
      break;
    case "sync-tools":
    case "watch-tools":
      if (args.command === "watch-tools") {
        args.flags.watch = true;
      }
      await syncToolsCommand(args);
      break;
    case "doctor":
      await doctorCommand(args);
      break;
    case "help":
    case undefined:
      printHelp();
      break;
    default:
      throw new CliError(`Unknown command "${args.command}". Run "chatdock-sdk help".`, 1);
  }
}

main().catch((error: unknown) => {
  if (error instanceof CliError) {
    console.error(error.message);
    process.exit(error.exitCode);
  }

  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
