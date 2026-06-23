import { describe, expect, it } from "vitest";
import { createToolManifest } from "./createToolManifest.js";
import { defineTool } from "./defineTool.js";

describe("createToolManifest", () => {
  it("returns safe tool metadata without execute functions", () => {
    const tool = defineTool({
      name: "buscar_clientes",
      description: "Busca clientes.",
      inputSchema: { type: "object", properties: {} },
      outputSchema: { type: "object" },
      dangerous: true,
      requiresConfirmation: true,
      permissions: [{ type: "role", anyOf: ["admin"] }],
      metadata: { group: "clients" },
      execute: async () => ({ data: { ok: true } }),
    });

    expect(createToolManifest([tool])).toEqual([
      {
        name: "buscar_clientes",
        description: "Busca clientes.",
        destructive: true,
        dangerous: true,
        requiresConfirmation: true,
        enabled: true,
        permissions: [{ type: "role", anyOf: ["admin"] }],
        metadata: { group: "clients" },
        inputSchema: { type: "object", properties: {} },
        outputSchema: { type: "object" },
      },
    ]);
    expect(JSON.stringify(createToolManifest([tool]))).not.toContain("execute");
  });
});
