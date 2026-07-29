import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createBambooShootAppearanceVariantRecipe } from "../gt_designer/single-mesh-evaluation/bamboo-shoot-appearance-variants.js";
import { BAMBOO_SHOOT_RECIPE } from "../gt_designer/src/reconstruction/objects/bamboo-shoot-recipe.js";
import { createBlueHatAppearanceVariantRecipe } from "../gt_designer/single-mesh-evaluation/blue-hat-appearance-variants.js";
import { BLUE_HAT_RECIPE } from "../gt_designer/src/reconstruction/objects/blue-hat-recipe.js";
import { createMushroomAppearanceVariantRecipe } from "../gt_designer/single-mesh-evaluation/mushroom-appearance-variants.js";
import { MUSHROOM_RECIPE } from "../gt_designer/src/reconstruction/objects/mushroom-recipe.js";

test("Bamboo Shoot semantic v2 keeps exact texture diagnostic and role gates hard", async () => {
  const baseline = JSON.parse(await readFile(
    new URL("../gt_designer/single-mesh-evaluation/baselines/bamboo-shoot-semantic-appearance-baseline-v2.json", import.meta.url),
    "utf8",
  ));
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

test("Mushroom semantic v2 declares measured cap and stem roles", async () => {
  const baseline = JSON.parse(await readFile(
    new URL("../gt_designer/single-mesh-evaluation/baselines/mushroom-semantic-appearance-baseline-v2.json", import.meta.url),
    "utf8",
  ));
  assert.deepEqual(baseline.semanticRoles.cap, [78, 23, 16]);
  assert.deepEqual(baseline.semanticRoles.stem, [98, 91, 75]);
  for (const variant of ["delete-cap-role", "delete-stem-role", "wrong-role-palette"]) {
    assert.notDeepEqual(
      createMushroomAppearanceVariantRecipe(MUSHROOM_RECIPE, variant).appearance,
      MUSHROOM_RECIPE.appearance,
    );
  }
});

test("Blue Hat semantic v2 keeps panel and motif damage observable", async () => {
  const baseline = JSON.parse(await readFile(
    new URL("../gt_designer/single-mesh-evaluation/baselines/blue-hat-semantic-appearance-baseline-v2.json", import.meta.url),
    "utf8",
  ));
  assert.deepEqual(Object.keys(baseline.semanticRoles), ["brim", "darkPanel", "lightPanel", "motif"]);
  assert.ok(baseline.diagnostic.includes("appearance.meanMaskedSsim"));
  for (const variant of baseline.requiredDestructiveControls) {
    assert.notDeepEqual(
      createBlueHatAppearanceVariantRecipe(BLUE_HAT_RECIPE, variant).appearance,
      BLUE_HAT_RECIPE.appearance,
    );
  }
});

test("Mushroom compact geometry v2 keeps all reference destructive controls rejected", async () => {
  const baselineSet = JSON.parse(await readFile(
    new URL("../gt_designer/single-mesh-evaluation/baselines/stage2-compact-geometry-baselines-v2.json", import.meta.url),
    "utf8",
  ));
  const report = JSON.parse(await readFile(
    new URL("../gt_designer/single-mesh-evaluation/reports/stage2-precalibration-v1.json", import.meta.url),
    "utf8",
  ));
  const baseline = baselineSet.objects.mushroom;
  const valueAt = (root, path) => path.split(".").reduce((value, key) => value?.[key], root);
  const passes = (metrics) => baseline.hard.every(({ path, operator, threshold }) =>
    operator === ">="
      ? valueAt(metrics, path) >= threshold
      : valueAt(metrics, path) <= threshold
  );
  const destructive = report.runs
    .find(({ objectId, runIndex }) => objectId === "mushroom" && runIndex === 1)
    .scenarios
    .filter(({ domain, classification }) =>
      domain === "geometry" && classification === "must-reject"
    );
  assert.ok(destructive.length > 0);
  assert.ok(destructive.every(({ comparison }) => !passes(comparison.aggregate)));
});
