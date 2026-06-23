import type {
  ChatbotRuntimeContext,
  ChatbotTool,
  ToolInputNormalizer,
  ToolInputValueNormalizer,
} from "../types.js";

type ObjectFieldNormalizers = Record<string, ToolInputValueNormalizer>;

const HALLUCINATED_ID_VALUES = new Set(["", "??", "null", "undefined", "-"]);

export function normalizeToolInputFields<TServices = unknown>(
  fields: ObjectFieldNormalizers,
): ToolInputNormalizer<TServices> {
  return ({ input }) => {
    if (!isPlainRecord(input)) {
      return input;
    }

    const normalized: Record<string, unknown> = { ...input };
    for (const [field, normalize] of Object.entries(fields)) {
      if (!(field in normalized)) {
        continue;
      }

      const nextValue = normalize(normalized[field]);
      if (nextValue === undefined) {
        delete normalized[field];
      } else {
        normalized[field] = nextValue;
      }
    }

    return normalized;
  };
}

export function competenciaSchema(): ToolInputValueNormalizer {
  return (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    const match = /^(\d{1,2})\/(\d{4})$/.exec(trimmed);
    if (!match) {
      return value;
    }

    const month = Number(match[1]);
    if (month < 1 || month > 12) {
      return value;
    }

    return `${match[2]}-${String(month).padStart(2, "0")}`;
  };
}

export function coerceLocaleDate(locale: string, timezone?: string): ToolInputValueNormalizer {
  return (value) => {
    if (value instanceof Date) {
      return formatDate(value, timezone);
    }

    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return value;
    }

    const localized = parseLocalizedDate(trimmed, locale);
    if (localized) {
      return localized;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return formatDate(parsed, timezone);
    }

    return value;
  };
}

export function coerceLocaleNumber(locale: string): ToolInputValueNormalizer {
  const separators = getNumberSeparators(locale);

  return (value) => {
    if (typeof value === "number") {
      return value;
    }

    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return value;
    }

    const normalized = trimmed
      .replace(/\s/g, "")
      .replace(new RegExp(`\\${separators.group}`, "g"), "")
      .replace(separators.decimal, ".");
    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : value;
  };
}

export function coerceLocaleBoolean(locale: string): ToolInputValueNormalizer {
  const normalizedLocale = locale.toLowerCase();
  const truthy = new Set(["true", "1", "yes", "y", "sim", "s"]);
  const falsy = new Set(["false", "0", "no", "n", "nao", "não"]);

  if (normalizedLocale.startsWith("pt")) {
    truthy.add("verdadeiro");
    falsy.add("falso");
  }

  return (value) => {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim().toLowerCase();
    if (truthy.has(normalized)) {
      return true;
    }
    if (falsy.has(normalized)) {
      return false;
    }

    return value;
  };
}

export function sanitizeHallucinatedId(): ToolInputValueNormalizer {
  return (value) => {
    if (typeof value !== "string") {
      return value;
    }

    return HALLUCINATED_ID_VALUES.has(value.trim().toLowerCase()) ? undefined : value;
  };
}

export function sanitizeNullableId(): ToolInputValueNormalizer {
  const sanitize = sanitizeHallucinatedId();

  return (value) => {
    const sanitized = sanitize(value);
    return sanitized === undefined ? null : sanitized;
  };
}

export async function normalizeToolInput<TServices = unknown>(input: {
  tool: ChatbotTool<unknown, unknown, TServices>;
  context: ChatbotRuntimeContext<TServices>;
  value: unknown;
  normalizers?: readonly ToolInputNormalizer<TServices>[];
}): Promise<unknown> {
  let normalized = input.value;
  const normalizers = [...(input.normalizers ?? []), ...(input.tool.inputNormalizers ?? [])];

  for (const normalize of normalizers) {
    normalized = await normalize({
      tool: input.tool,
      context: input.context,
      input: normalized,
    });
  }

  return parseWithSchema(input.tool.inputSchema, normalized);
}

function parseWithSchema(schema: unknown, value: unknown): unknown {
  if (!schema || typeof schema !== "object") {
    return value;
  }

  const candidate = schema as {
    parse?: (input: unknown) => unknown;
    safeParse?: (input: unknown) => { success: boolean; data?: unknown; error?: unknown };
  };

  if (typeof candidate.parse === "function") {
    return candidate.parse(value);
  }

  if (typeof candidate.safeParse === "function") {
    const result = candidate.safeParse(value);
    if (result.success) {
      return result.data;
    }
    throw result.error ?? new Error("Tool input validation failed.");
  }

  return value;
}

function parseLocalizedDate(value: string, locale: string): string | undefined {
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (!match) {
    return undefined;
  }

  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3]);
  const monthFirst = locale.toLowerCase().startsWith("en-us");
  const day = monthFirst ? second : first;
  const month = monthFirst ? first : second;

  if (!isValidDateParts(year, month, day)) {
    return undefined;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function formatDate(value: Date, timezone?: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(value);
}

function getNumberSeparators(locale: string): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234.5);
  return {
    group: parts.find((part) => part.type === "group")?.value ?? ",",
    decimal: parts.find((part) => part.type === "decimal")?.value ?? ".",
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
