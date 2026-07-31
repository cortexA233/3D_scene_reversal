import { createHash } from "node:crypto";

/**
 * Serialize a value with deterministic key order so a hash over the result is
 * stable across runs, platforms, and insertion orders.
 *
 * Only JSON-representable values are accepted. `undefined` properties are
 * dropped exactly as `JSON.stringify` drops them, and non-finite numbers are
 * rejected rather than silently becoming `null`.
 */
export function canonicalize(value, path = "$") {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} must be a finite number`);
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    const items = value.map((item, index) =>
      canonicalize(item === undefined ? null : item, `${path}[${index}]`),
    );
    return `[${items.join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    const entries = keys.map(
      (key) => `${JSON.stringify(key)}:${canonicalize(value[key], `${path}.${key}`)}`,
    );
    return `{${entries.join(",")}}`;
  }
  throw new TypeError(`${path} is not JSON-representable (${typeof value})`);
}

export function canonicalHash(value) {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Pretty JSON with sorted keys, for artifacts a human reads and a check
 * compares byte-for-byte.
 */
export function stableStringify(value) {
  return `${JSON.stringify(JSON.parse(canonicalize(value)), sortedReplacer, 2)}\n`;
}

function sortedReplacer(_key, value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, value[key]]),
  );
}
