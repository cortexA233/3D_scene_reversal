import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  auditObjectScalars,
  UNIVERSAL_ALGORITHM_VALUES,
} from "../tools/acceptance/object-scalar-audit.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("complete-source scalar audit includes recipe and generated-source choices", async () => {
  const result = await auditObjectScalars({
    projectRoot: PROJECT_ROOT,
    objectId: "umbrella",
  });
  assert.equal(result.count, result.recipeCount + result.generatorCount);
  assert.ok(result.generatorCount > 0);
  assert.deepEqual(result.universalAlgorithmValues, [
    ...UNIVERSAL_ALGORITHM_VALUES,
  ]);
  assert.ok(
    result.generators[0].evidence.objectSpecific.some(
      (entry) => entry.value === 0.032,
    ),
  );
});
