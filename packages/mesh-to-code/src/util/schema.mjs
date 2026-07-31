/**
 * A dependency-free validator for the JSON Schema subset the Decision Point
 * protocol uses. Keeping it in-package matters twice over: the package may not
 * take a dependency that requires native compilation, and a decider running
 * under any harness must be able to read the same schema document the kernel
 * validates against.
 *
 * Supported keywords: type, const, enum, required, properties,
 * additionalProperties, items, minItems, maxItems, minimum, maximum,
 * exclusiveMinimum, multipleOf, minLength, pattern, oneOf.
 */

const TYPE_CHECKS = {
  object: (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value),
  array: (value) => Array.isArray(value),
  string: (value) => typeof value === "string",
  number: (value) => typeof value === "number" && Number.isFinite(value),
  integer: (value) => Number.isInteger(value),
  boolean: (value) => typeof value === "boolean",
  null: (value) => value === null,
};

function typeMatches(value, type) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((candidate) => {
    const check = TYPE_CHECKS[candidate];
    if (!check) throw new Error(`unsupported schema type: ${candidate}`);
    return check(value);
  });
}

function validateNode(value, schema, path, failures) {
  if (schema.type !== undefined && !typeMatches(value, schema.type)) {
    failures.push({
      path,
      keyword: "type",
      expected: schema.type,
      actual: describe(value),
    });
    return;
  }

  if (schema.const !== undefined && value !== schema.const) {
    failures.push({ path, keyword: "const", expected: schema.const, actual: value });
  }

  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    failures.push({ path, keyword: "enum", expected: schema.enum, actual: value });
  }

  if (schema.oneOf !== undefined) {
    const matches = schema.oneOf.filter((branch) => {
      const branchFailures = [];
      validateNode(value, branch, path, branchFailures);
      return branchFailures.length === 0;
    });
    if (matches.length !== 1) {
      failures.push({
        path,
        keyword: "oneOf",
        expected: `exactly one of ${schema.oneOf.length} branches`,
        actual: `${matches.length} matched`,
      });
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      failures.push({
        path,
        keyword: "minLength",
        expected: schema.minLength,
        actual: value.length,
      });
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      failures.push({ path, keyword: "pattern", expected: schema.pattern, actual: value });
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (schema.minimum !== undefined && value < schema.minimum) {
      failures.push({ path, keyword: "minimum", expected: schema.minimum, actual: value });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      failures.push({ path, keyword: "maximum", expected: schema.maximum, actual: value });
    }
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      failures.push({
        path,
        keyword: "exclusiveMinimum",
        expected: schema.exclusiveMinimum,
        actual: value,
      });
    }
    if (schema.multipleOf !== undefined && value % schema.multipleOf !== 0) {
      failures.push({
        path,
        keyword: "multipleOf",
        expected: schema.multipleOf,
        actual: value,
      });
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      failures.push({
        path,
        keyword: "minItems",
        expected: schema.minItems,
        actual: value.length,
      });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      failures.push({
        path,
        keyword: "maxItems",
        expected: schema.maxItems,
        actual: value.length,
      });
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) =>
        validateNode(item, schema.items, `${path}[${index}]`, failures),
      );
    }
  }

  if (TYPE_CHECKS.object(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) {
        failures.push({ path: `${path}.${key}`, keyword: "required" });
      }
    }
    const properties = schema.properties ?? {};
    for (const [key, child] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) {
        validateNode(value[key], child, `${path}.${key}`, failures);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) {
          failures.push({ path: `${path}.${key}`, keyword: "additionalProperties" });
        }
      }
    }
  }
}

function describe(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * @returns {{ valid: boolean, failures: Array<object> }}
 */
export function validate(value, schema) {
  const failures = [];
  validateNode(value, schema, "$", failures);
  return { valid: failures.length === 0, failures };
}

export function formatFailures(failures) {
  return failures
    .map((failure) =>
      failure.keyword === "required"
        ? `${failure.path} is required`
        : `${failure.path} violates ${failure.keyword}` +
          (failure.expected === undefined
            ? ""
            : ` (expected ${JSON.stringify(failure.expected)}, got ${JSON.stringify(failure.actual)})`),
    )
    .join("; ");
}
