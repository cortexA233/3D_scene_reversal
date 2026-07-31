/**
 * The complete-source Object-specific Scalar audit.
 *
 * Same definition the host repository's `auditObjectScalars` uses: every numeric
 * leaf of the recipe, plus every numeric literal in generator and operator source
 * except the declared universal algorithm and control-flow values. Recipe leaves
 * are never excluded. Counting only the recipe would repeat the mistake the
 * Umbrella `86/96` figure recorded — it counted recipe literals and left generator
 * and generated-shader constants out.
 */
export const UNIVERSAL_ALGORITHM_VALUES = Object.freeze([0, 0.01, 0.5, 1, 2, 3, 4]);

const NUMERIC_LITERAL = /(?<![\w$.])(?:0[xX][\da-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/g;

function maskComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => " ".repeat(match.length))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, prefix) =>
      prefix + " ".repeat(match.length - prefix.length),
    );
}

function numericValue(literal) {
  return /^0[xX]/.test(literal) ? Number.parseInt(literal, 16) : Number.parseFloat(literal);
}

function countRecipeLeaves(value, path = "$", leaves = []) {
  if (typeof value === "number") {
    leaves.push({ path, value });
    return leaves;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => countRecipeLeaves(item, `${path}[${index}]`, leaves));
    return leaves;
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      countRecipeLeaves(value[key], `${path}.${key}`, leaves);
    }
  }
  return leaves;
}

export function auditScalars({ recipe, sources, budget }) {
  const universal = new Set(UNIVERSAL_ALGORITHM_VALUES);
  const recipeLeaves = countRecipeLeaves(recipe);

  const sourceEvidence = Object.entries(sources).map(([name, source]) => {
    const visible = maskComments(source);
    const literals = [...visible.matchAll(NUMERIC_LITERAL)].map((match) => {
      const value = numericValue(match[0]);
      return {
        literal: match[0],
        value,
        classification: universal.has(value)
          ? "universal-algorithm-or-control-flow"
          : "object-specific",
      };
    });
    const objectSpecific = literals.filter(
      (entry) => entry.classification === "object-specific",
    );
    return {
      source: name,
      classifiedLiteralCount: literals.length,
      objectSpecificCount: objectSpecific.length,
      objectSpecific,
    };
  });

  const recipeCount = recipeLeaves.length;
  const sourceCount = sourceEvidence.reduce(
    (sum, entry) => sum + entry.objectSpecificCount,
    0,
  );
  const count = recipeCount + sourceCount;

  return {
    definition:
      "all numeric recipe leaves plus object-specific numeric literals in the emitted generator and every operator source it carries",
    exclusionPolicy:
      "source literals are excluded only when equal to a declared universal algorithm or control-flow value; recipe leaves are never excluded",
    universalAlgorithmValues: [...universal],
    recipeCount,
    recipeLeaves,
    sourceCount,
    sources: sourceEvidence,
    count,
    maximum: budget,
    withinBudget: count <= budget,
  };
}
