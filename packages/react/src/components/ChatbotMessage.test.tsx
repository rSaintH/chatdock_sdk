import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const chatbotMock = {
  approveTool: vi.fn(),
  labels: {
    userLabel: "You",
    assistantLabel: "Assistant",
    toolLabel: "Tool",
    approvalTitle: "Approval required",
    approvalDescription: "This action needs explicit confirmation before it can run.",
    approvalConfirm: "Tem certeza?",
    approvalCancel: "Cancelar",
  },
};

vi.mock("../context", () => ({
  useChatbot: () => chatbotMock,
}));

describe("ChatbotMessage", () => {
  it("renders an approval prompt for blocked tool output", async () => {
    const { ChatbotMessage } = await import("./ChatbotMessage");

    const markup = renderToStaticMarkup(
      <ChatbotMessage
        labels={chatbotMock.labels}
        message={{
          id: "msg_1",
          role: "assistant",
          parts: [
            {
              type: "tool-delete_account",
              state: "output-error",
              errorText: "Tool \"delete_account\" requires explicit human approval.",
              input: { id: "client_1" },
            },
          ],
        }}
      />,
    );

    expect(markup).toContain("Approval required");
    expect(markup).toContain("This action needs explicit confirmation before it can run.");
    expect(markup).toContain("Tem certeza?");
    expect(markup).toContain("Cancelar");
    expect(markup).toContain("delete_account");
  });
});
