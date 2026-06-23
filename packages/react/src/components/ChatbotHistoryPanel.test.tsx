import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const chatbotMock = {
  conversationId: "conv_2",
  labels: {},
  setOpen: vi.fn(),
  setTrigger: vi.fn(),
  chat: {
    setMessages: vi.fn(),
  },
};

vi.mock("../context", () => ({
  useChatbot: () => chatbotMock,
}));

const historyMock = {
  conversations: [
    {
      id: "conv_1",
      title: "First",
      updatedAt: "2026-06-20T10:00:00.000Z",
    },
    {
      id: "conv_2",
      updatedAt: "2026-06-21T10:00:00.000Z",
    },
  ],
  isLoading: false,
  error: undefined,
  refreshConversations: vi.fn(),
  searchConversations: vi.fn(),
  selectConversation: vi.fn(),
  renameConversation: vi.fn(),
  removeConversation: vi.fn(),
  clearConversations: vi.fn(),
};

vi.mock("../hooks/useChatbotConversations", () => ({
  useChatbotConversations: () => historyMock,
}));

describe("ChatbotHistoryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders conversations, search, and actions", async () => {
    const { ChatbotHistoryPanel } = await import("./ChatbotHistoryPanel");

    const markup = renderToStaticMarkup(
      <ChatbotHistoryPanel endpoint="/api/chat-history" mode="remote" />,
    );

    expect(markup).toContain("History");
    expect(markup).toContain("Open, rename, delete or continue past conversations.");
    expect(markup).toContain("Search conversations");
    expect(markup).toContain("First");
    expect(markup).toContain("conv_1");
    expect(markup).toContain("conv_2");
    expect(markup).toContain("Open");
    expect(markup).toContain("Rename");
    expect(markup).toContain("Delete");
  });
});
