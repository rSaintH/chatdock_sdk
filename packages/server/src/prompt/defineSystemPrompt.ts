import type { ChatbotRuntimeContext, SystemPromptDefinition, SystemPromptPart } from "../types.js";

export function defineSystemPrompt<TServices = unknown>(
  definition: SystemPromptDefinition<TServices> | SystemPromptPart<TServices> | SystemPromptPart<TServices>[],
): SystemPromptDefinition<TServices> {
  if (typeof definition === "string" || typeof definition === "function") {
    return { parts: [definition] };
  }

  if (Array.isArray(definition)) {
    return { parts: definition };
  }

  return definition;
}

export async function renderSystemPrompt<TServices = unknown>(
  definition: SystemPromptDefinition<TServices> | SystemPromptPart<TServices> | SystemPromptPart<TServices>[] | undefined,
  context: ChatbotRuntimeContext<TServices>,
): Promise<string | undefined> {
  if (!definition) {
    return undefined;
  }

  const prompt = defineSystemPrompt(definition);
  const parts: string[] = [];

  for (const part of prompt.parts) {
    const value = typeof part === "function" ? await part(context) : part;
    if (value?.trim()) {
      parts.push(value.trim());
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}
