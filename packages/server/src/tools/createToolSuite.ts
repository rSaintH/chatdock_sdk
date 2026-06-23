import { defineTool, type DefineToolInput } from "./defineTool.js";
import type { ChatbotTool } from "../types.js";

export type ToolSuiteDefaults<TServices = unknown> = Partial<
  Pick<
    ChatbotTool<unknown, unknown, TServices>,
    "authorize" | "destructive" | "dangerous" | "requiresConfirmation" | "timeoutMs" | "enabled" | "maxOutputBytes"
  >
> & {
  metadata?: Record<string, unknown>;
};

export type ToolSuite<TServices = unknown> = {
  appId?: string;
  tools: ChatbotTool<unknown, unknown, TServices>[];
};

export function createToolSuite<TServices = unknown>(input: {
  appId?: string;
  tools: readonly (
    | ChatbotTool<unknown, unknown, TServices>
    | DefineToolInput<unknown, unknown, TServices>
  )[];
  defaults?: ToolSuiteDefaults<TServices>;
}): ToolSuite<TServices> {
  const tools = input.tools.map((tool) => normalizeTool(tool, input.defaults));
  const seen = new Set<string>();

  for (const tool of tools) {
    if (seen.has(tool.name)) {
      throw new Error(`Duplicate tool registered: ${tool.name}`);
    }
    seen.add(tool.name);
  }

  return {
    ...(input.appId ? { appId: input.appId } : {}),
    tools,
  };
}

function normalizeTool<TServices>(
  tool: ChatbotTool<unknown, unknown, TServices> | DefineToolInput<unknown, unknown, TServices>,
  defaults: ToolSuiteDefaults<TServices> | undefined,
) {
  const merged = {
    ...defaults,
    ...tool,
    metadata: {
      ...(defaults?.metadata ?? {}),
      ...(tool.metadata ?? {}),
    },
  };

  return defineTool(merged);
}
