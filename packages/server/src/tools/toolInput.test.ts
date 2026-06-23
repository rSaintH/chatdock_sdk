import { describe, expect, it } from "vitest";
import {
  coerceLocaleBoolean,
  coerceLocaleDate,
  coerceLocaleNumber,
  competenciaSchema,
  normalizeToolInput,
  normalizeToolInputFields,
  sanitizeHallucinatedId,
  sanitizeNullableId,
} from "./toolInput.js";
import type { ChatbotRuntimeContext, ChatbotTool } from "../types.js";

function createContext(input: Partial<ChatbotRuntimeContext> = {}): ChatbotRuntimeContext {
  return {
    request: new Request("https://example.com"),
    user: { id: "user_1" },
    conversationId: "conv_1",
    clientContext: {},
    services: {},
    ...input,
  };
}

describe("tool input normalizers", () => {
  it("normalizes competencia from MM/AAAA to YYYY-MM", () => {
    expect(competenciaSchema()("06/2026")).toBe("2026-06");
    expect(competenciaSchema()("6/2026")).toBe("2026-06");
  });

  it("coerces locale numbers", () => {
    expect(coerceLocaleNumber("pt-BR")("1.234,56")).toBe(1234.56);
  });

  it("coerces locale booleans", () => {
    const normalize = coerceLocaleBoolean("pt-BR");

    expect(normalize("sim")).toBe(true);
    expect(normalize("nao")).toBe(false);
    expect(normalize("não")).toBe(false);
  });

  it("coerces locale dates", () => {
    expect(coerceLocaleDate("pt-BR", "America/Bahia")("23/06/2026")).toBe("2026-06-23");
  });

  it("sanitizes hallucinated ids", () => {
    expect(sanitizeHallucinatedId()("??")).toBeUndefined();
    expect(sanitizeNullableId()("??")).toBeNull();
  });

  it("normalizes object fields and omits undefined sanitizer output", async () => {
    const normalize = normalizeToolInputFields({
      competencia: competenciaSchema(),
      amount: coerceLocaleNumber("pt-BR"),
      confirmed: coerceLocaleBoolean("pt-BR"),
      optionalId: sanitizeHallucinatedId(),
      nullableId: sanitizeNullableId(),
    });

    expect(
      normalize({
        tool: createTool(),
        context: createContext(),
        input: {
          competencia: "06/2026",
          amount: "1.234,56",
          confirmed: "sim",
          optionalId: "??",
          nullableId: "undefined",
        },
      }),
    ).toEqual({
      competencia: "2026-06",
      amount: 1234.56,
      confirmed: true,
      nullableId: null,
    });
  });

  it("applies default and tool normalizers before final schema parsing", async () => {
    const tool = createTool({
      inputSchema: {
        parse(input: unknown) {
          const value = input as { amount: unknown; clientId?: unknown };
          if (typeof value.amount !== "number") {
            throw new Error("amount must be a number");
          }
          if ("clientId" in value) {
            throw new Error("clientId should have been sanitized");
          }
          return { ...value, parsed: true };
        },
      },
      inputNormalizers: [normalizeToolInputFields({ clientId: sanitizeHallucinatedId() })],
    });

    await expect(
      normalizeToolInput({
        tool,
        context: createContext(),
        value: { amount: "1.234,56", clientId: "??" },
        normalizers: [normalizeToolInputFields({ amount: coerceLocaleNumber("pt-BR") })],
      }),
    ).resolves.toEqual({
      amount: 1234.56,
      parsed: true,
    });
  });
});

function createTool(input: Partial<ChatbotTool> = {}): ChatbotTool {
  return {
    name: "test_tool",
    description: "Test tool",
    inputSchema: {},
    execute: async () => ({ ok: true }),
    ...input,
  };
}
