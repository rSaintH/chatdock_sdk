import {
  allOfToolAuthorizers,
  allowRoles,
  allowTenant,
} from "./authorization.js";
import type {
  ChatbotRuntimeContext,
  ChatbotTool,
  ToolAuthorize,
  ToolInputSchema,
  ToolPermissionRule,
} from "../types.js";

export type DefineToolInput<TInput, TOutput, TServices = unknown> =
  Omit<ChatbotTool<TInput, TOutput, TServices>, "inputSchema" | "destructive" | "authorize"> & {
    inputSchema?: ToolInputSchema<TInput>;
    input?: ToolInputSchema<TInput>;
    destructive?: boolean;
    dangerous?: boolean;
    authorize?: ToolAuthorize<TInput, TServices>;
  };

export function defineTool<TInput, TOutput, TServices = unknown>(
  definition: DefineToolInput<TInput, TOutput, TServices>,
): ChatbotTool<TInput, TOutput, TServices> {
  if (!definition.name || !/^[a-zA-Z0-9_-]+$/.test(definition.name)) {
    throw new Error("Tool name must contain only letters, numbers, underscores, and dashes.");
  }

  if (!definition.description.trim()) {
    throw new Error(`Tool "${definition.name}" must include a description.`);
  }

  const inputSchema = definition.inputSchema ?? definition.input;
  if (inputSchema == null) {
    throw new Error(`Tool "${definition.name}" must include an inputSchema.`);
  }

  const authorize = combineAuthorizers(
    definition.authorize,
    definition.permissions,
    definition.enabled,
  );

  const { input: _input, dangerous, requiresConfirmation, destructive, ...rest } = definition;
  const normalized: ChatbotTool<TInput, TOutput, TServices> = {
    ...rest,
    inputSchema,
  };

  const destructiveValue = destructive ?? dangerous;
  if (destructiveValue !== undefined) {
    normalized.destructive = destructiveValue;
  }
  if (dangerous !== undefined) {
    normalized.dangerous = dangerous;
  }
  if (requiresConfirmation !== undefined) {
    normalized.requiresConfirmation = requiresConfirmation;
  }
  if (authorize) {
    normalized.authorize = authorize;
  }

  return normalized;
}

function combineAuthorizers<TInput, TServices>(
  authorize: ToolAuthorize<TInput, TServices> | undefined,
  permissions: readonly ToolPermissionRule[] | undefined,
  enabled: ChatbotTool<TInput, unknown, TServices>["enabled"],
): ToolAuthorize<TInput, TServices> | undefined {
  const authorizers: ToolAuthorize<unknown, TServices>[] = [];

  if (enabled !== undefined) {
    authorizers.push(async ({ context }) => {
      const allowed = typeof enabled === "function" ? await enabled(context) : enabled;
      return allowed ? true : { allowed: false, reason: "This tool is disabled." };
    });
  }

  if (permissions?.length) {
    authorizers.push(createPermissionsAuthorizer(permissions));
  }

  if (authorize) {
    authorizers.push(authorize as ToolAuthorize<unknown, TServices>);
  }

  if (authorizers.length === 0) {
    return undefined;
  }

  return allOfToolAuthorizers(...authorizers) as ToolAuthorize<TInput, TServices>;
}

function createPermissionsAuthorizer<TServices>(
  permissions: readonly ToolPermissionRule[],
): ToolAuthorize<unknown, TServices> {
  const authorizers = permissions.map((permission) => {
    switch (permission.type) {
      case "role": {
        const options = {
          mode: permission.allOf ? ("all" as const) : ("any" as const),
          ...(permission.reason ? { reason: permission.reason } : {}),
        };
        return permissionAuthorizer(
          permission,
          allowRoles(permission.allOf ?? permission.anyOf ?? [], options),
        );
      }
      case "tenant":
        return permissionAuthorizer(
          permission,
          allowTenant(permission.anyOf, permission.reason ? { reason: permission.reason } : {}),
        );
      case "scope":
        return createScopeAuthorizer(permission);
    }
  });

  return allOfToolAuthorizers(...authorizers);
}

function permissionAuthorizer<TServices>(
  permission: ToolPermissionRule,
  authorize: ToolAuthorize<unknown, TServices>,
): ToolAuthorize<unknown, TServices> {
  if (permission.type === "role" && !permission.anyOf?.length && !permission.allOf?.length) {
    return () => true;
  }

  if (permission.type === "tenant" && permission.required === false && !permission.anyOf?.length) {
    return () => true;
  }

  return authorize;
}

function createScopeAuthorizer<TServices>(
  permission: Extract<ToolPermissionRule, { type: "scope" }>,
): ToolAuthorize<unknown, TServices> {
  if (!permission.anyOf?.length && !permission.allOf?.length) {
    return () => true;
  }

  const hasScope = ({ context }: { context: ChatbotRuntimeContext<TServices> }) => {
    const scopes = new Set(context.user?.scopes ?? []);
    const allowed = permission.allOf
      ? permission.allOf.every((scope) => scopes.has(scope))
      : permission.anyOf?.some((scope) => scopes.has(scope)) ?? true;

    return allowed
      ? true
      : {
          allowed: false,
          reason: permission.reason ?? "The authenticated user does not have the required scope.",
        };
  };

  return hasScope;
}
