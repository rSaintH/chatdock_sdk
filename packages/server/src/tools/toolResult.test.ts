import { describe, expect, it } from "vitest";
import { toolError, toolOk } from "./toolResult.js";

describe("tool result helpers", () => {
  it("wraps plain data in a standard success result", () => {
    expect(toolOk({ ok: true })).toEqual({ data: { ok: true } });
  });

  it("preserves structured success results", () => {
    expect(toolOk({ data: { items: [] }, rowCount: 0, display: "No items" })).toEqual({
      data: { items: [] },
      rowCount: 0,
      display: "No items",
    });
  });

  it("creates structured tool errors", () => {
    expect(toolError({ message: "Unavailable", code: "unavailable", retryable: true })).toEqual({
      error: "Unavailable",
      code: "unavailable",
      retryable: true,
    });
  });
});
