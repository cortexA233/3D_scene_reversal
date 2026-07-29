import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  canonicalSupportDirections,
  generateStone,
  STONE_SUPPORT_DIRECTION_COUNT,
} from "../gt_designer/src/reconstruction/objects/stone-generator.js";
import { STONE_RECIPE } from "../gt_designer/src/reconstruction/objects/stone-recipe.js";
import { generateObject } from "../gt_designer/src/reconstruction/core/object-generator.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("Stone exposes one ordered 24-direction contract to production and fitting", async () => {
  const directions = canonicalSupportDirections();
  assert.equal(STONE_SUPPORT_DIRECTION_COUNT, 24);
  assert.equal(directions.length, STONE_SUPPORT_DIRECTION_COUNT);
  assert.equal(
    STONE_RECIPE.shape.supportDistances.length,
    STONE_SUPPORT_DIRECTION_COUNT,
  );
  assert.ok(
    directions.every((direction) => Math.abs(direction.length() - 1) < 1e-12),
  );
  assert.deepEqual(
    directions.slice(0, 6).map((direction) => direction.toArray()),
    [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ],
  );

  const fitter = await readFile(
    path.join(PROJECT_ROOT, "tools/development/fit-stone-supports.mjs"),
    "utf8",
  );
  assert.match(fitter, /canonicalSupportDirections/);
  assert.match(fitter, /STONE_SUPPORT_DIRECTION_COUNT/);
  assert.match(fitter, /STONE_RECIPE/);
  assert.doesNotMatch(fitter, /function canonicalDirections/);
});

test("Stone rejects a recipe whose support-distance count drifts", () => {
  const invalidRecipe = {
    ...STONE_RECIPE,
    shape: {
      ...STONE_RECIPE.shape,
      supportDistances: STONE_RECIPE.shape.supportDistances.slice(0, -1),
    },
  };
  assert.throws(
    () => generateObject(invalidRecipe, generateStone),
    /support distance count/,
  );
});
