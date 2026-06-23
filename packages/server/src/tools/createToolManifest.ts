import type { ChatbotTool, ToolPermissionRule } from "../types.js";

export type ToolManifestEntry = {
  name: string;
  description: string;
  destructive: boolean;
  dangerous: boolean;
  requiresConfirmation: boolean;
  enabled: boolean;
  permissions?: ToolPermissionRule[];
  metadata?: Record<string, unknown>;
  inputSchema?: unknown;
  outputSchema?: unknown;
};

export function createToolManifest(
  tools: readonly ChatbotTool<unknown, unknown, unknown>[] | { tools: readonly ChatbotTool<unknown, unknown, unknown>[] },
): ToolManifestEntry[] {
  const toolList: readonly ChatbotTool<unknown, unknown, unknown>[] = "tools" in tools ? tools.tools : tools;

  return toolList.map((tool) => {
    const entry: ToolManifestEntry = {
      name: tool.name,
      description: tool.description,
      destructive: tool.destructive === true,
      dangerous: tool.dangerous === true,
      requiresConfirmation: tool.requiresConfirmation === true,
      enabled: typeof tool.enabled === "boolean" ? tool.enabled : true,
    };

    if (tool.permissions) {
      entry.permissions = tool.permissions;
    }
    if (tool.metadata) {
      entry.metadata = tool.metadata;
    }
    if (isSerializableSchema(tool.inputSchema)) {
      entry.inputSchema = tool.inputSchema;
    }
    if (isSerializableSchema(tool.outputSchema)) {
      entry.outputSchema = tool.outputSchema;
    }

    return entry;
  });
}

function isSerializableSchema(value: unknown) {
  return value != null && typeof value === "object" && !containsFunction(value, new Set());
}

function containsFunction(value: unknown, seen: Set<object>): boolean {
  if (typeof value === "function") {
    return true;
  }

  if (value == null || typeof value !== "object") {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  return Object.values(value).some((item) => containsFunction(item, seen));
}
