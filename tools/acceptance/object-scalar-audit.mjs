import { readFile } from "node:fs/promises";
import path from "node:path";

import { OBJECT_BUDGETS } from "./nonvisual-contract.mjs";
import {
  numericLiteralEvidence,
  objectSpecificLiteralEvidence,
} from "./static-audit.mjs";

export const UNIVERSAL_ALGORITHM_VALUES = Object.freeze([
  0,
  0.01,
  0.5,
  1,
  2,
  3,
  4,
]);

export const OBJECT_SCALAR_SOURCES = Object.freeze({
  probe: Object.freeze({
    recipe: "gt_designer/src/reconstruction/testing/probe-generator.js",
    generators: Object.freeze([]),
  }),
  "stone-path": Object.freeze({
    recipe: "gt_designer/src/reconstruction/objects/stone-path-recipe.js",
    generators: Object.freeze([
      "gt_designer/src/reconstruction/objects/stone-path-generator.js",
    ]),
  }),
  stone: Object.freeze({
    recipe: "gt_designer/src/reconstruction/objects/stone-recipe.js",
    generators: Object.freeze([
      "gt_designer/src/reconstruction/objects/stone-generator.js",
    ]),
  }),
  vase: Object.freeze({
    recipe: "gt_designer/src/reconstruction/objects/vase-recipe.js",
    generators: Object.freeze([
      "gt_designer/src/reconstruction/objects/vase-generator.js",
    ]),
  }),
  umbrella: Object.freeze({
    recipe: "gt_designer/src/reconstruction/objects/umbrella-recipe.js",
    generators: Object.freeze([
      "gt_designer/src/reconstruction/objects/umbrella-generator.js",
    ]),
  }),
});

async function readEvidence(projectRoot, sourceFile, evidenceFactory) {
  return {
    sourceFile,
    evidence: evidenceFactory(
      await readFile(path.join(projectRoot, sourceFile), "utf8"),
    ),
  };
}

/**
 * Count every object-specific numeric choice in a recipe, generator, generated
 * shader string, and listed object helper. Only the frozen universal values
 * above may be excluded from generator code.
 */
export async function auditObjectScalars({ projectRoot, objectId }) {
  const sources = OBJECT_SCALAR_SOURCES[objectId];
  const budget = OBJECT_BUDGETS[objectId]?.scalars;
  if (!sources || !Number.isFinite(budget)) {
    throw new Error(`No complete-source scalar contract for ${objectId}`);
  }
  const recipe = await readEvidence(
    projectRoot,
    sources.recipe,
    numericLiteralEvidence,
  );
  const generators = await Promise.all(
    sources.generators.map((sourceFile) =>
      readEvidence(projectRoot, sourceFile, (source) =>
        objectSpecificLiteralEvidence(source, {
          universalValues: UNIVERSAL_ALGORITHM_VALUES,
        }),
      ),
    ),
  );
  const recipeCount = recipe.evidence.count;
  const generatorCount = generators.reduce(
    (sum, entry) => sum + entry.evidence.count,
    0,
  );
  const count = recipeCount + generatorCount;
  return {
    definition:
      "all numeric recipe leaves plus object-specific numeric literals in generators, generated shaders, and explicitly listed object helpers",
    exclusionPolicy:
      "generator literals are excluded only when equal to a frozen universal algorithm/control-flow value; recipe leaves are never excluded",
    universalAlgorithmValues: [...UNIVERSAL_ALGORITHM_VALUES],
    recipe,
    generators,
    recipeCount,
    generatorCount,
    count,
    maximum: budget,
    passed: count <= budget,
  };
}
