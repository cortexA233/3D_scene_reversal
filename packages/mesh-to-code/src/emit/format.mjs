/**
 * Emission must be byte-stable, so every number written into generated source
 * goes through one formatter. Values are rounded to a fixed significant-digit
 * budget: that keeps the source compact, keeps two runs identical, and keeps a
 * recipe literal from silently carrying more precision than it was fitted with.
 */
const SIGNIFICANT_DIGITS = 9;

export function formatScalar(value) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`cannot emit non-finite scalar: ${value}`);
  }
  if (value === 0) return "0";
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
  const rounded = Number.parseFloat(value.toPrecision(SIGNIFICANT_DIGITS));
  return String(rounded === 0 ? 0 : rounded);
}

export function formatScalarArray(values) {
  return `[${Array.from(values, formatScalar).join(", ")}]`;
}

export function formatNestedScalarArray(rows) {
  return `[${rows.map((row) => formatScalarArray(row)).join(", ")}]`;
}

export function formatString(value) {
  return JSON.stringify(value);
}

export function roundScalar(value) {
  return Number.parseFloat(formatScalar(value));
}
