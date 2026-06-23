import type { AuditAdapter, AuditEvent, UsageAdapter, UsageEvent } from "../types.js";

export type InMemoryAuditAdapter = AuditAdapter & {
  events: AuditEvent[];
  clear(): void;
  list(filter?: AuditEventFilter): AuditEvent[];
};

export type AuditEventFilter = {
  type?: AuditEvent["type"] | AuditEvent["type"][];
  conversationId?: string;
  toolName?: string;
  userId?: string;
};

export function createInMemoryAuditAdapter(initialEvents: AuditEvent[] = []): InMemoryAuditAdapter {
  const events: AuditEvent[] = [...initialEvents];

  return {
    events,
    clear() {
      events.length = 0;
    },
    list(filter) {
      return events.filter((event) => matchesAuditEvent(event, filter));
    },
    async record(event) {
      events.push(event);
    },
  };
}

export type InMemoryUsageAdapter<TServices = unknown> = UsageAdapter<TServices> & {
  records: UsageEvent[];
  clear(): void;
  list(filter?: UsageEventFilter): UsageEvent[];
};

export type UsageEventFilter = {
  conversationId?: string;
  userId?: string | null;
  tenant?: string | null;
  provider?: string | null;
  model?: string | null;
};

export function createInMemoryUsageAdapter<TServices = unknown>(
  initialRecords: UsageEvent[] = [],
  estimateCost?: UsageAdapter<TServices>["estimateCost"],
): InMemoryUsageAdapter<TServices> {
  const records: UsageEvent[] = [...initialRecords];

  return {
    records,
    ...(estimateCost ? { estimateCost } : {}),
    clear() {
      records.length = 0;
    },
    list(filter) {
      return records.filter((event) => matchesUsageEvent(event, filter));
    },
    async record(event) {
      records.push(event);
    },
  };
}

function matchesAuditEvent(event: AuditEvent, filter: AuditEventFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.type) {
    const allowed = Array.isArray(filter.type) ? filter.type : [filter.type];
    if (!allowed.includes(event.type)) {
      return false;
    }
  }
  if (filter.conversationId && !("conversationId" in event && event.conversationId === filter.conversationId)) {
    return false;
  }
  if (filter.toolName && !("toolName" in event && event.toolName === filter.toolName)) {
    return false;
  }
  if (filter.userId) {
    const userId = "user" in event && event.user ? event.user.id : undefined;
    if (userId !== filter.userId) {
      return false;
    }
  }
  return true;
}

function matchesUsageEvent(event: UsageEvent, filter: UsageEventFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.conversationId && event.conversation_id !== filter.conversationId) {
    return false;
  }
  if (filter.userId !== undefined && event.user_id !== filter.userId) {
    return false;
  }
  if (filter.tenant !== undefined && event.tenant !== filter.tenant) {
    return false;
  }
  if (filter.provider !== undefined && event.provider !== filter.provider) {
    return false;
  }
  if (filter.model !== undefined && event.model !== filter.model) {
    return false;
  }
  return true;
}
