import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createBambooShootAppearanceVariantRecipe } from "../gt_designer/single-mesh-evaluation/bamboo-shoot-appearance-variants.js";
import { BAMBOO_SHOOT_RECIPE } from "../gt_designer/src/reconstruction/objects/bamboo-shoot-recipe.js";

test("Bamboo Shoot semantic v2 keeps exact texture diagnostic and role gates hard", async () => {
  const baselineSet = JSON.parse(await readFile(
    new URL("../gt_designer/single-mesh-evaluation/baselines/stage2-semantic-appearance-baselines-v2.json", import.meta.url),
    "utf8",
  ));
  const baseline = baselineSet.objects["bamboo-shoot"];
  assert.equal(baseline.frozen, true);
  assert.equal(baseline.version, "bamboo-shoot-semantic-category-baseline-v2");
  assert.ok(baseline.hard.some(({ path }) =>
    path === "semanticPattern.roles.sheath.replacementCoverage"
  ));
  assert.ok(baseline.diagnostic.includes("appearance.meanMaskedSsim"));
});

test("Bamboo Shoot appearance controls are isolated recipe copies", () => {
  const original = JSON.stringify(BAMBOO_SHOOT_RECIPE);
  for (const variant of [
    "delete-sheath-role",
    "wrong-role-palette",
    "flat-single-role",
  ]) {
    const damaged = createBambooShootAppearanceVariantRecipe(
      BAMBOO_SHOOT_RECIPE,
      variant,
    );
    assert.notDeepEqual(damaged.appearance, BAMBOO_SHOOT_RECIPE.appearance);
  }
  assert.equal(JSON.stringify(BAMBOO_SHOOT_RECIPE), original);
});
