import type { ChatbotTenant, ChatbotUser } from "./types.js";

export function getTenantId(user: ChatbotUser | null | undefined): string | undefined {
  return user?.tenantId?.trim() || undefined;
}

export function requireTenant(user: ChatbotUser | null | undefined): ChatbotTenant {
  const tenantId = getTenantId(user);
  if (!tenantId) {
    throw new Error("Tenant is required.");
  }

  return { id: tenantId };
}

export function assertSameTenant(expected: string, actual: string | undefined | null): void {
  if (!actual) {
    throw new Error("Tenant is required.");
  }

  if (expected !== actual) {
    throw new Error("Tenant mismatch.");
  }
}
