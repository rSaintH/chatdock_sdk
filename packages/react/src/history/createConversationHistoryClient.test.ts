import { describe, expect, it, vi } from "vitest";
import { createConversationHistoryClient } from "./createConversationHistoryClient";

describe("createConversationHistoryClient", () => {
  it("calls the history endpoint for list, search, load, rename, and delete", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({ conversations: [conversationSummary("conv_1")] }))
      .mockResolvedValueOnce(jsonResponse({ conversations: [conversationSummary("conv_2")] }))
      .mockResolvedValueOnce(
        jsonResponse({
          conversation: {
            ...conversationSummary("conv_2"),
            messages: [{ id: "msg_1", role: "user", parts: [{ type: "text", text: "hello" }] }],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ conversation: { ...conversationSummary("conv_2"), title: "Renamed" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const client = createConversationHistoryClient({
      endpoint: "/api/conversations",
      fetch,
      getAuthToken: async () => "token_1",
      getHeaders: () => ({ "x-tenant-id": "tenant_1" }),
    });

    await expect(client.list({ limit: 10 })).resolves.toEqual([conversationSummary("conv_1")]);
    await expect(client.search({ query: "client", limit: 5 })).resolves.toEqual([conversationSummary("conv_2")]);
    await expect(client.load("conv_2")).resolves.toMatchObject({
      id: "conv_2",
      messages: [{ id: "msg_1", role: "user", parts: [{ type: "text", text: "hello" }] }],
    });
    await expect(client.rename("conv_2", "Renamed")).resolves.toMatchObject({ id: "conv_2", title: "Renamed" });
    await expect(client.delete("conv_2")).resolves.toBeUndefined();

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      new URL("http://localhost/api/conversations?limit=10"),
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      new URL("http://localhost/api/conversations?limit=5&search=client"),
      expect.any(Object),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      new URL("http://localhost/api/conversations/conv_2"),
      expect.any(Object),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      new URL("http://localhost/api/conversations/conv_2"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "Renamed" }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      new URL("http://localhost/api/conversations/conv_2"),
      expect.objectContaining({ method: "DELETE" }),
    );

    const headers = fetch.mock.calls[0]?.[1]?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("authorization")).toBe("Bearer token_1");
    expect((headers as Headers).get("x-tenant-id")).toBe("tenant_1");
  });

  it("uses the server error message when a request fails", async () => {
    const client = createConversationHistoryClient({
      endpoint: "/api/conversations",
      fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        jsonResponse({ error: "Authentication required." }, { status: 401 }),
      ),
    });

    await expect(client.list()).rejects.toThrow("Authentication required.");
  });
});

function conversationSummary(id: string) {
  return {
    id,
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
  };
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "content-type": "application/json" },
  });
}
