import { describe, expect, it } from "vitest";
import { createToolSuite } from "./createToolSuite.js";

describe("createToolSuite", () => {
  it("normalizes tool definitions with defaults", () => {
    const suite = createToolSuite({
      appId: "portal",
      defaults: {
        destructive: false,
        metadata: { app: "portal" },
      },
      tools: [
        {
          name: "buscar_clientes",
          description: "Busca clientes.",
          input: {},
          metadata: { group: "clients" },
          execute: async () => ({ data: { ok: true } }),
        },
      ],
    });

    expect(suite.appId).toBe("portal");
    expect(suite.tools[0]).toEqual(
      expect.objectContaining({
        name: "buscar_clientes",
        inputSchema: {},
        destructive: false,
        metadata: { app: "portal", group: "clients" },
      }),
    );
  });

  it("rejects duplicate tool names", () => {
    expect(() =>
      createToolSuite({
        tools: [
          {
            name: "buscar_clientes",
            description: "Busca clientes.",
            inputSchema: {},
            execute: async () => ({ data: { ok: true } }),
          },
          {
            name: "buscar_clientes",
            description: "Busca clientes novamente.",
            inputSchema: {},
            execute: async () => ({ data: { ok: true } }),
          },
        ],
      }),
    ).toThrow(/Duplicate tool registered/);
  });
});
