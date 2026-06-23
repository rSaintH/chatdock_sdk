import type {
  Awaitable,
  ChatbotRuntimeContext,
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
