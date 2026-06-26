import path from "node:path";
import { CliArgs, CliError } from "../utils/cli.js";
import { pathExists, writeFileIfChanged } from "../utils/fs.js";
import { inferChatbotRoot } from "../utils/tools.js";
import { syncToolsCommand } from "./sync-tools.js";

const slugPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const snakeCasePattern = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

export async function makeToolCommand(args: CliArgs) {
  const rawName = args.positional[0];
  if (!rawName) {
    throw new CliError("make-tool requires a tool name. Example: chatdock-sdk make-tool get-clients");
  }

  if (!slugPattern.test(rawName)) {
    throw new CliError(`Invalid tool name "${rawName}". Use letters, numbers, dashes or underscores.`);
  }

  const slug = toSlug(rawName);
  const toolName = toSnakeCase(rawName);
  if (!snakeCasePattern.test(toolName)) {
    throw new CliError(`Invalid generated tool name "${toolName}". Tool names must be snake_case.`);
  }

  const chatbotRoot = await inferChatbotRoot(args.cwd, args);
  const relativePath = path.join(chatbotRoot, "tools", slug, "index.ts");
  const filePath = path.join(args.cwd, relativePath);
  if (!args.force && (await pathExists(filePath))) {
    throw new CliError(`${toPosix(relativePath)} already exists. Use --force to overwrite it.`);
  }

  const status = await writeFileIfChanged(filePath, createToolTemplate(args, toolName), args.dryRun);
  const suffix = args.dryRun ? " (dry run)" : "";
  console.log(`${status}: ${toPosix(relativePath)}${suffix}`);

  await syncToolsCommand(args);
}

function createToolTemplate(args: CliArgs, toolName: string) {
  const role = typeof args.flags.role === "string" ? args.flags.role : undefined;
  const tenant = args.flags.tenant === true;
  const destructive = args.flags.destructive === true;
  const authorizers = [
    role ? `allowRoles([${JSON.stringify(role)}])` : undefined,
    tenant ? "allowTenant()" : undefined,
  ].filter(Boolean);
  const imports = ["defineTool", "toolOk"];
  if (authorizers.length > 1) {
    imports.push("allOfToolAuthorizers");
  }
  if (role) {
    imports.push("allowRoles");
  }
  if (tenant) {
    imports.push("allowTenant");
  }

  const authorize =
    authorizers.length === 0
      ? ""
      : authorizers.length === 1
        ? `\n  authorize: ${authorizers[0]},`
        : `\n  authorize: allOfToolAuthorizers(\n    ${authorizers.join(",\n    ")},\n  ),`;

  return `import { ${imports.join(", ")} } from "@rsainth/chatdock-sdk";
import { z } from "zod";

export default defineTool({
  name: ${JSON.stringify(toolName)},
  description: "Replace this description with what the tool does for the authenticated user.",
  input: z.object({
    query: z.string().trim().min(1).max(120).optional(),
  }),${destructive ? "\n  destructive: true," : ""}${authorize}
  execute: async ({ input, context }) => {
    return toolOk({
      data: {
        query: input.query ?? null,
        userId: context.user?.id ?? null,
        tenantId: context.user?.tenantId ?? null,
        items: [],
      },
      rowCount: 0,
      display: "No items were fetched. Replace this example with app logic.",
    });
  },
});
`;
}

function toSlug(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

function toSnakeCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
}

function toPosix(filePath: string) {
  return filePath.split(path.sep).join("/");
}
