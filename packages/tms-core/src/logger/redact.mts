export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  "password",
  "password_hash",
  "token",
  "refresh_token",
  "authorization",
  "driver_code",
  "vat_number",
  "card_last4",
]);

export const REDACTED_VALUE = "[REDACTED]";
const CIRCULAR_VALUE = "[CIRCULAR]";

// Walks the whole log object recursively so a sensitive key is caught at any
// nesting depth, not just the ones a static path list happens to name.
export function redactSensitive(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, seen));
  }

  if (value !== null && typeof value === "object") {
    if (seen.has(value)) {
      return CIRCULAR_VALUE;
    }
    seen.add(value);

    // Error's message/stack are non-enumerable own properties, so a plain
    // Object.entries walk below sees none of them and silently produces {}
    // — pull them out explicitly first. Any *extra* enumerable props an
    // error was given (err.details = {...}) still get walked/redacted below.
    const base = value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : {};

    const result: Record<string, unknown> = { ...base };
    for (const [key, entryValue] of Object.entries(value)) {
      result[key] = SENSITIVE_KEYS.has(key.toLowerCase())
        ? REDACTED_VALUE
        : redactSensitive(entryValue, seen);
    }
    return result;
  }

  return value;
}
