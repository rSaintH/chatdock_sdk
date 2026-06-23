import type {
  Awaitable,
  ChatbotRuntimeContext,
  ChatbotTool,
  ToolPolicyMatrix,
  ToolAuthorizationResult,
  ToolAuthorize,
} from "../types.js";

type AuthorizationOptions = {
  reason?: string;
};

type RoleMode = "any" | "all";

export function allowRoles<TServices = unknown>(
  roles: readonly string[],
  options: AuthorizationOptions & { mode?: RoleMode } = {},
): ToolAuthorize<unknown, TServices> {
  return ({ context }) => {
    const mode = options.mode ?? "any";
    const userRoles = new Set(context.user?.roles ?? []);
    const allowed =
      mode === "all"
        ? roles.every((role) => userRoles.has(role))
        : roles.some((role) => userRoles.has(role));

    return allowed ? true : denied(options.reason ?? "The authenticated user does not have the required role.");
  };
}

export function allowTenant<TServices = unknown>(
  tenantIds?: string | readonly string[],
  options: AuthorizationOptions = {},
): ToolAuthorize<unknown, TServices> {
  const allowedTenants = tenantIds == null ? null : new Set(Array.isArray(tenantIds) ? tenantIds : [tenantIds]);

  return ({ context }) => {
    const tenantId = context.user?.tenantId;
    if (!tenantId) {
      return denied(options.reason ?? "The authenticated user is not assigned to a tenant.");
    }

    if (!allowedTenants || allowedTenants.has(tenantId)) {
      return true;
    }

    return denied(options.reason ?? "The authenticated user is not assigned to an allowed tenant.");
  };
}

export function allowFeatureFlag<TServices = unknown>(
  flag: string,
  options: AuthorizationOptions = {},
): ToolAuthorize<unknown, TServices> {
  return ({ context }) => {
    return readFeatureFlag(context, flag)
      ? true
      : denied(options.reason ?? `Feature flag "${flag}" is not enabled.`);
  };
}

export function requireHumanApproval<TServices = unknown>(
  options: AuthorizationOptions & {
    approvalKey?: string;
    approvedToolsKey?: string;
  } = {},
): ToolAuthorize<unknown, TServices> {
  const approvalKey = options.approvalKey ?? "humanApproved";
  const approvedToolsKey = options.approvedToolsKey ?? "approvedToolNames";

  return ({ tool, context }) => {
    const approvedTools = context.clientContext[approvedToolsKey];
    if (Array.isArray(approvedTools) && approvedTools.includes(tool.name)) {
      return true;
    }

    return context.clientContext[approvalKey] === true
      ? true
      : denied(options.reason ?? "This tool requires explicit human approval.");
  };
}

export function denyDestructiveInDemo<TServices = unknown>(
  options: AuthorizationOptions & {
    demo?: boolean | ((context: ChatbotRuntimeContext<TServices>) => Awaitable<boolean>);
    demoKey?: string;
  } = {},
): ToolAuthorize<unknown, TServices> {
  const demoKey = options.demoKey ?? "demoMode";

  return async ({ tool, context }) => {
    if (!tool.destructive) {
      return true;
    }

    const isDemo =
      typeof options.demo === "function"
        ? await options.demo(context)
        : options.demo ?? context.clientContext[demoKey] === true;

    return isDemo ? denied(options.reason ?? "Destructive tools are disabled in demo mode.") : true;
  };
}

export function allOfToolAuthorizers<TServices = unknown>(
  ...authorizers: ToolAuthorize<unknown, TServices>[]
): ToolAuthorize<unknown, TServices> {
  return async (input) => {
    for (const authorize of authorizers) {
      const result = await authorize(input);
      if (!isAllowed(result)) {
        return result;
      }
    }

    return true;
  };
}

export function createToolPolicyAuthorizer<TInput = unknown, TServices = unknown>(
  policy: ToolPolicyMatrix<TInput, TServices>,
): ToolAuthorize<TInput, TServices> {
  const authorizers: ToolAuthorize<TInput, TServices>[] = [];

  if (policy.roles) {
    authorizers.push(
      allowRoles(policy.roles.allOf ?? policy.roles.anyOf ?? [], {
        mode: policy.roles.allOf ? "all" : "any",
        ...(policy.roles.reason ? { reason: policy.roles.reason } : {}),
      }) as ToolAuthorize<TInput, TServices>,
    );
  }

  if (policy.scopes) {
    authorizers.push(createScopeAuthorizer(policy.scopes));
  }

  if (policy.tenants) {
    if (policy.tenants.required !== false || policy.tenants.anyOf?.length) {
      authorizers.push(
        allowTenant(policy.tenants.anyOf, policy.tenants.reason ? { reason: policy.tenants.reason } : {}) as ToolAuthorize<
          TInput,
          TServices
        >,
      );
    }
  }

  for (const featureFlag of policy.featureFlags ?? []) {
    const flag = typeof featureFlag === "string" ? featureFlag : featureFlag.flag;
    const reason = typeof featureFlag === "string" ? undefined : featureFlag.reason;
    authorizers.push(
      allowFeatureFlag(flag, reason ? { reason } : {}) as ToolAuthorize<TInput, TServices>,
    );
  }

  for (const predicate of policy.predicates ?? []) {
    authorizers.push(async ({ tool, context, input, phase = "execute" }) => {
      if (phase !== "execute" || input === undefined) {
        return true;
      }

      const allowed = await predicate.when({
        tool: tool as ChatbotTool<TInput, unknown, TServices>,
        context,
        input: input as TInput,
      });
      return allowed
        ? true
        : {
            allowed: false,
            reason: predicate.reason ?? `Tool input was denied by policy${predicate.name ? ` "${predicate.name}"` : ""}.`,
            ...(predicate.code ? { code: predicate.code } : {}),
          };
    });
  }

  return allOfToolAuthorizers(...(authorizers as ToolAuthorize<unknown, TServices>[])) as ToolAuthorize<
    TInput,
    TServices
  >;
}

export function anyOfToolAuthorizers<TServices = unknown>(
  ...authorizers: ToolAuthorize<unknown, TServices>[]
): ToolAuthorize<unknown, TServices> {
  return async (input) => {
    let lastDenied: ToolAuthorizationResult = denied("No authorization rule allowed this tool.");

    for (const authorize of authorizers) {
      const result = await authorize(input);
      if (isAllowed(result)) {
        return true;
      }
      lastDenied = result;
    }

    return lastDenied;
  };
}

function denied(reason: string) {
  return { allowed: false, reason };
}

function isAllowed(result: Awaited<ReturnType<ToolAuthorize>>): boolean {
  return typeof result === "boolean" ? result : result.allowed;
}

function createScopeAuthorizer<TInput, TServices>(
  permission: {
    anyOf?: readonly string[];
    allOf?: readonly string[];
    reason?: string;
  },
): ToolAuthorize<TInput, TServices> {
  if (!permission.anyOf?.length && !permission.allOf?.length) {
    return () => true;
  }

  return ({ context }) => {
    const scopes = new Set(context.user?.scopes ?? []);
    const allowed = permission.allOf
      ? permission.allOf.every((scope) => scopes.has(scope))
      : permission.anyOf?.some((scope) => scopes.has(scope)) ?? true;

    return allowed
      ? true
      : denied(permission.reason ?? "The authenticated user does not have the required scope.");
  };
}

function readFeatureFlag<TServices>(context: ChatbotRuntimeContext<TServices>, flag: string): boolean {
  return (
    readFlagFromRecord(context.runtimeConfig, flag) ||
    readFlagFromRecord(context.runtimeConfig?.featureFlags, flag) ||
    readFlagFromRecord(context.clientContext.featureFlags, flag) ||
    readFlagFromRecord(context.clientContext, flag)
  );
}

function readFlagFromRecord(value: unknown, flag: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return (value as Record<string, unknown>)[flag] === true;
}
