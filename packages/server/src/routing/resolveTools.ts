import { filterAuthorizedTools } from "../tools/createToolRegistry.js";
import type {
  AuditAdapter,
  ChatbotHandlerOptions,
  ChatbotRequestBody,
  ChatbotRuntimeConfig,
  ChatbotRuntimeContext,
  ChatbotTool,
  IntentRoute,
  ToolAvailability,
  ToolResolverResult,
} from "../types.js";
import type { UIMessage } from "ai";

export type ResolvedTools<TServices = unknown> = {
  tools: ChatbotTool<unknown, unknown, TServices>[];
  route?: IntentRoute;
  settings: ChatbotRuntimeConfig | null;
  unavailableTools: ToolAvailability[];
};

export async function resolveRequestTools<TServices = unknown>(input: {
  options: Pick<
    ChatbotHandlerOptions<TServices>,
    "detectIntent" | "resolveTools" | "runtimeConfigAdapter" | "tools" | "toolsByIntent"
  >;
  context: ChatbotRuntimeContext<TServices>;
  body: ChatbotRequestBody;
  messages: UIMessage[];
  auditAdapter: AuditAdapter;
  step?: {
    stepNumber: number;
    stepMessages?: unknown[];
    steps?: unknown[];
    experimentalContext?: unknown;
  };
}): Promise<ResolvedTools<TServices>> {
  const settings = await input.options.runtimeConfigAdapter?.get({
    context: input.context,
    body: input.body,
  }) ?? null;
  const lastMessage = input.messages[input.messages.length - 1];
  const detected = await input.options.detectIntent?.({
    context: input.context,
    body: input.body,
    messages: input.messages,
    ...(lastMessage ? { message: lastMessage } : {}),
    settings,
    ...(input.step
      ? {
          stepNumber: input.step.stepNumber,
          ...(input.step.stepMessages ? { stepMessages: input.step.stepMessages } : {}),
          ...(input.step.steps ? { steps: input.step.steps } : {}),
          ...(input.step.experimentalContext !== undefined
            ? { experimentalContext: input.step.experimentalContext }
            : {}),
        }
      : {}),
  });
  const route = normalizeIntentRoute(detected);
  const unavailableTools: ToolAvailability[] = [];
  const configuredTools = input.options.tools ?? [];
  const authorizedTools = await filterAuthorizedTools({
    tools: configuredTools,
    context: input.context,
    auditAdapter: input.auditAdapter,
  });

  let tools = filterToolsByIntent({
    tools: authorizedTools,
    route,
    toolsByIntent: input.options.toolsByIntent,
    unavailableTools,
  });
  tools = filterToolsByRuntimeConfig({
    tools,
    settings,
    unavailableTools,
  });

  if (input.options.resolveTools) {
    const beforeHook = tools;
    const resolved = await input.options.resolveTools({
      user: input.context.user,
      ...(route ? { intent: route.intent, route } : {}),
      settings,
      ...(lastMessage ? { message: lastMessage } : {}),
      messages: input.messages,
      context: input.context,
      tools: beforeHook,
      unavailableTools: [...unavailableTools],
      ...(input.step
        ? {
            stepNumber: input.step.stepNumber,
            ...(input.step.stepMessages ? { stepMessages: input.step.stepMessages } : {}),
            ...(input.step.steps ? { steps: input.step.steps } : {}),
            ...(input.step.experimentalContext !== undefined
              ? { experimentalContext: input.step.experimentalContext }
              : {}),
          }
        : {}),
    });

    if (resolved) {
      const normalized = normalizeToolResolverResult(resolved);
      tools = keepOnlyKnownTools(normalized.tools, beforeHook);
      const returnedNames = new Set(tools.map((tool) => tool.name));
      for (const tool of beforeHook) {
        if (!returnedNames.has(tool.name)) {
          unavailableTools.push({
            name: tool.name,
            available: false,
            reason: "Filtered by resolveTools hook.",
          });
        }
      }
      if (normalized.unavailableTools) {
        unavailableTools.push(...normalized.unavailableTools);
      }
    }
  }

  return {
    tools,
    ...(route ? { route } : {}),
    settings,
    unavailableTools: dedupeUnavailableTools(unavailableTools),
  };
}

function normalizeIntentRoute(value: IntentRoute | string | null | undefined): IntentRoute | undefined {
  if (!value) {
    return undefined;
  }

  return typeof value === "string" ? { intent: value } : value;
}

function filterToolsByIntent<TServices>(input: {
  tools: ChatbotTool<unknown, unknown, TServices>[];
  route: IntentRoute | undefined;
  toolsByIntent: Record<string, readonly string[]> | undefined;
  unavailableTools: ToolAvailability[];
}): ChatbotTool<unknown, unknown, TServices>[] {
  if (!input.route?.intent || !input.toolsByIntent?.[input.route.intent]) {
    return input.tools;
  }

  const allowedNames = new Set(input.toolsByIntent[input.route.intent]);
  if (input.route.forcedTool) {
    allowedNames.add(input.route.forcedTool);
  }

  return input.tools.filter((tool) => {
    if (allowedNames.has(tool.name)) {
      return true;
    }

    input.unavailableTools.push({
      name: tool.name,
      available: false,
      reason: `Tool is not enabled for intent "${input.route!.intent}".`,
    });
    return false;
  });
}

function filterToolsByRuntimeConfig<TServices>(input: {
  tools: ChatbotTool<unknown, unknown, TServices>[];
  settings: ChatbotRuntimeConfig | null;
  unavailableTools: ToolAvailability[];
}): ChatbotTool<unknown, unknown, TServices>[] {
  const config = readRuntimeToolConfig(input.settings);
  if (!config.enabledToolNames && config.disabledToolNames.size === 0) {
    return input.tools;
  }

  return input.tools.filter((tool) => {
    const disabled = config.disabledToolNames.has(tool.name);
    const notEnabled = config.enabledToolNames ? !config.enabledToolNames.has(tool.name) : false;
    if (!disabled && !notEnabled) {
      return true;
    }

    input.unavailableTools.push({
      name: tool.name,
      available: false,
      reason: "Tool is disabled by runtime config.",
    });
    return false;
  });
}

function readRuntimeToolConfig(settings: ChatbotRuntimeConfig | null): {
  enabledToolNames: Set<string> | null;
  disabledToolNames: Set<string>;
} {
  const disabledToolNames = new Set<string>();
  let enabledToolNames: Set<string> | null = null;

  if (!settings) {
    return { enabledToolNames, disabledToolNames };
  }

  if (Array.isArray(settings.disabledToolNames)) {
    for (const name of settings.disabledToolNames) {
      if (typeof name === "string" && name) {
        disabledToolNames.add(name);
      }
    }
  }

  if (Array.isArray(settings.enabledToolNames)) {
    enabledToolNames = new Set(settings.enabledToolNames.filter((name): name is string => typeof name === "string"));
  }

  if (Array.isArray(settings.tools)) {
    enabledToolNames = new Set<string>();
    for (const item of settings.tools) {
      if (typeof item === "string" && item) {
        enabledToolNames.add(item);
        continue;
      }

      if (!item || typeof item !== "object" || typeof item.name !== "string" || !item.name) {
        continue;
      }

      if (item.enabled === false) {
        disabledToolNames.add(item.name);
      } else {
        enabledToolNames.add(item.name);
      }
    }
  }

  return { enabledToolNames, disabledToolNames };
}

function normalizeToolResolverResult<TServices>(
  result: ToolResolverResult<TServices>,
): {
  tools: ChatbotTool<unknown, unknown, TServices>[];
  unavailableTools?: ToolAvailability[];
} {
  return Array.isArray(result) ? { tools: result } : result;
}

function keepOnlyKnownTools<TServices>(
  tools: ChatbotTool<unknown, unknown, TServices>[],
  knownTools: ChatbotTool<unknown, unknown, TServices>[],
): ChatbotTool<unknown, unknown, TServices>[] {
  const knownByName = new Map(knownTools.map((tool) => [tool.name, tool]));
  const seen = new Set<string>();
  const kept: ChatbotTool<unknown, unknown, TServices>[] = [];

  for (const tool of tools) {
    const known = knownByName.get(tool.name);
    if (!known || seen.has(tool.name)) {
      continue;
    }
    seen.add(tool.name);
    kept.push(known);
  }

  return kept;
}

function dedupeUnavailableTools(unavailableTools: ToolAvailability[]): ToolAvailability[] {
  const byName = new Map<string, ToolAvailability>();
  for (const item of unavailableTools) {
    if (!item.name || byName.has(item.name)) {
      continue;
    }
    byName.set(item.name, item);
  }
  return [...byName.values()];
}
