import type { ChatbotUser, ConversationRecord, PersistenceAdapter } from "../types.js";

function createId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}_${random}`;
}

export function createInMemoryPersistence(): PersistenceAdapter & {
  conversations: Map<string, ConversationRecord>;
} {
  const conversations = new Map<string, ConversationRecord>();
  const messages = new Map<string, Parameters<PersistenceAdapter["saveMessage"]>[0]["message"][]>();

  return {
    conversations,
    async getOrCreateConversation(input) {
      const now = new Date();
      const id = input.conversationId ?? createId("conv");
      const existing = conversations.get(id);

      if (existing) {
        existing.updatedAt = now;
        return existing;
      }

      const conversation: ConversationRecord = {
        id,
        createdAt: now,
        updatedAt: now,
        metadata: { context: input.context },
      };
      const ownerId = userId(input.user);
      if (ownerId) {
        conversation.userId = ownerId;
      }
      if (input.user?.tenantId) {
        conversation.tenantId = input.user.tenantId;
      }

      conversations.set(id, conversation);
      messages.set(id, []);

      return conversation;
    },
    async loadMessages(input) {
      return [...(messages.get(input.conversationId) ?? [])];
    },
    async saveMessage(input) {
      const existing = messages.get(input.conversationId) ?? [];
      const next = [...existing.filter((message) => message.id !== input.message.id), input.message];
      messages.set(input.conversationId, next);
      touch(conversations, input.conversationId);
    },
    async saveMessages(input) {
      messages.set(input.conversationId, [...input.messages]);
      touch(conversations, input.conversationId);
    },
    async listConversations(input) {
      return listVisibleConversations(conversations, input.user, input.limit);
    },
    async loadConversation(input) {
      const conversation = conversations.get(input.conversationId);
      if (!conversation || !canAccessConversation(conversation, input.user)) {
        return null;
      }

      return {
        ...conversation,
        messages: [...(messages.get(input.conversationId) ?? [])],
      };
    },
    async updateConversation(input) {
      const conversation = conversations.get(input.conversationId);
      if (!conversation || !canAccessConversation(conversation, input.user)) {
        return null;
      }

      if (input.title !== undefined) {
        conversation.title = input.title;
      }
      if (input.metadata) {
        conversation.metadata = { ...(conversation.metadata ?? {}), ...input.metadata };
      }
      conversation.updatedAt = new Date();

      return conversation;
    },
    async deleteConversation(input) {
      const conversation = conversations.get(input.conversationId);
      if (!conversation || !canAccessConversation(conversation, input.user)) {
        return false;
      }

      conversations.delete(input.conversationId);
      messages.delete(input.conversationId);
      return true;
    },
    async searchConversations(input) {
      const query = input.query.trim().toLowerCase();
      if (!query) {
        return listVisibleConversations(conversations, input.user, input.limit);
      }

      const matching = listVisibleConversations(conversations, input.user).filter((conversation) => {
        if (conversation.title?.toLowerCase().includes(query)) {
          return true;
        }

        const storedMessages = messages.get(conversation.id) ?? [];
        return storedMessages.some((message) => messageToText(message).toLowerCase().includes(query));
      });

      return input.limit ? matching.slice(0, input.limit) : matching;
    },
  };
}

function userId(user: ChatbotUser | null): string | undefined {
  return user?.id;
}

function touch(conversations: Map<string, ConversationRecord>, conversationId: string): void {
  const conversation = conversations.get(conversationId);
  if (conversation) {
    conversation.updatedAt = new Date();
  }
}

function listVisibleConversations(
  conversations: Map<string, ConversationRecord>,
  user: ChatbotUser | null,
  limit?: number,
): ConversationRecord[] {
  const records = [...conversations.values()]
    .filter((conversation) => canAccessConversation(conversation, user))
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());

  return limit ? records.slice(0, limit) : records;
}

function canAccessConversation(conversation: ConversationRecord, user: ChatbotUser | null): boolean {
  if (!user) {
    return !conversation.userId && !conversation.tenantId;
  }

  if (conversation.userId !== user.id) {
    return false;
  }

  if (conversation.tenantId && conversation.tenantId !== user.tenantId) {
    return false;
  }

  return true;
}

function messageToText(message: Parameters<PersistenceAdapter["saveMessage"]>[0]["message"]): string {
  return message.parts
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }
      return "";
    })
    .join(" ");
}
