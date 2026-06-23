import type { AuditAdapter, RateLimitAdapter, ToolExecutionRateLimitAdapter, UsageAdapter } from "../types.js";

export function createNoopAuditAdapter(): AuditAdapter {
  return {
    record: () => undefined,
  };
}

export function createNoopRateLimitAdapter(): RateLimitAdapter {
  return {
    check: () => ({ allowed: true }),
  };
}

export function createNoopToolExecutionRateLimitAdapter<TServices = unknown>(): ToolExecutionRateLimitAdapter<TServices> {
  return {
    check: () => ({ allowed: true }),
  };
}

export function createNoopUsageAdapter(): UsageAdapter {
  return {
    record: () => undefined,
  };
}
