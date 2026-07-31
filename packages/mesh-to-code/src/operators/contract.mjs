/**
 * The Contract Operator definition.
 *
 * A Contract Operator is a reusable, parameterized geometry construction exposed
 * as a pure deterministic function with a declared parameter signature and scalar
 * count, containing no object-specific authored data and no asset access. New code
 * may only enter the pipeline this way: one-off object-specific generator source is
 * not a permitted output.
 *
 * The builder's own source is what gets emitted. `builderSource` is
 * `Function.prototype.toString()` of the very function the fitting loop called, so
 * the code that was scored and the code that ships cannot drift apart. That also
 * forces the builder to be self-contained — it may close over nothing, because the
 * emitted module has no surrounding scope to close over.
 */

const FORBIDDEN_SOURCE_PATTERNS = Object.freeze([
  ["ambient-randomness", /\bMath\s*\.\s*random\b/],
  ["ambient-time", /\bDate\b|\bperformance\s*\.\s*now\b|\bhrtime\b/],
  ["module-access", /\bimport\s*\(|\brequire\s*\(|\bimport\s+[\w*{]/],
  ["global-access", /\bglobalThis\b|\bprocess\b|\bwindow\b|\bdocument\b/],
  ["asset-access", /\bfetch\s*\(|\bXMLHttpRequest\b|\breadFile\b|\bnew\s+URL\s*\(/],
  ["dynamic-evaluation", /\beval\s*\(|\bnew\s+Function\b/],
]);

export const PARAMETER_KINDS = Object.freeze(["integer", "scalar", "scalarPairArray"]);

export function createContractOperator({
  operatorId,
  version,
  summary,
  seededFrom,
  parameterSignature,
  builder,
  countScalars,
  materialRoleCount = 1,
}) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(operatorId)) {
    throw new Error(`operatorId must be a lowercase slug: ${operatorId}`);
  }
  for (const parameter of parameterSignature) {
    if (!PARAMETER_KINDS.includes(parameter.kind)) {
      throw new Error(`${operatorId}.${parameter.name} has unknown kind ${parameter.kind}`);
    }
  }
  const builderSource = builder.toString();
  return Object.freeze({
    operatorId,
    version,
    summary,
    seededFrom,
    parameterSignature: Object.freeze(parameterSignature.map((entry) => Object.freeze({ ...entry }))),
    materialRoleCount,
    build: builder,
    builderSource,
    builderName: builder.name,
    countScalars,
  });
}

/**
 * Conformance checks for one operator. These run before an operator is admitted to
 * the library and before an authored operator is used, so a violating operator is
 * caught by measurement rather than by review.
 */
export function checkOperatorContract(operator, sampleParameters) {
  const findings = [];

  for (const [id, pattern] of FORBIDDEN_SOURCE_PATTERNS) {
    if (pattern.test(operator.builderSource)) {
      findings.push({ id, detail: `builder source matches ${pattern}` });
    }
  }

  let determinism = null;
  try {
    const first = operator.build(sampleParameters);
    const second = operator.build(sampleParameters);
    const same =
      first.positions.length === second.positions.length &&
      first.indices.length === second.indices.length &&
      first.positions.every((value, index) => value === second.positions[index]) &&
      first.indices.every((value, index) => value === second.indices[index]);
    determinism = same;
    if (!same) {
      findings.push({
        id: "non-determinism",
        detail: "two calls with identical parameters produced different geometry",
      });
    }
    if (first.indices.length % 3 !== 0 || first.indices.length === 0) {
      findings.push({
        id: "not-triangles",
        detail: "the builder did not return a non-empty multiple of three indices",
      });
    }
  } catch (error) {
    findings.push({
      id: "builder-threw",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const scalarCount = operator.countScalars(sampleParameters);
  if (!Number.isInteger(scalarCount) || scalarCount < 0) {
    findings.push({ id: "unscalar-counted", detail: "countScalars did not return a count" });
  }

  return {
    operatorId: operator.operatorId,
    conformant: findings.length === 0,
    findings,
    determinism,
    declaredScalarCount: scalarCount,
    parameterSignature: operator.parameterSignature,
  };
}
