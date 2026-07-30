import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { generateScene } from "../gt_designer/src/reconstruction/scene/scene-generator.js";
import { generateSceneObject } from "../gt_designer/src/reconstruction/scene/scene-object-generators.js";
import { SPREAD_RANGE } from "../tools/reconstruction/fit-horizon-spread.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const [history, fitted] = await Promise.all([
  readFile(
    path.join(
      PROJECT_ROOT,
      ".scratch/scene-parity-foundation/evidence/fitting-history-v1.json",
    ),
    "utf8",
  ).then(JSON.parse),
  readFile(
    path.join(PROJECT_ROOT, "tools/reconstruction/fitted/horizon-spread-v1.json"),
    "utf8",
  ).then(JSON.parse),
]);

test("the loop improved the metric it declared it was targeting", () => {
  assert.equal(history.metric, "horizon.groups.silhouetteError.mean");
  assert.ok(history.after < history.before, `${history.before} -> ${history.after}`);
  assert.equal(history.unrelatedEntitiesDrifted, 0);
  assert.ok(history.unrelatedEntitiesChecked >= 50);
  // The combined skyline is a max across overlapping groups, so it is reported
  // for context rather than targeted; the tracer must not make it worse.
  assert.ok(
    history.combinedProfileP95.after <= history.combinedProfileP95.before,
    "the tracer degraded the combined Horizon Profile",
  );
  for (const row of history.perGroup) {
    assert.ok(row.after <= row.before, `${row.semanticId} got worse`);
    assert.ok(
      row.spreadScale >= SPREAD_RANGE.minimum && row.spreadScale <= SPREAD_RANGE.maximum,
    );
  }
});

test("the correction is persisted in the Scene Recipe, not in an evaluation artifact", () => {
  const mountains = ISLAND_SCENE_RECIPE.entities.filter((entity) => entity.kind === "mountain");

  assert.equal(mountains.length, Object.keys(fitted.values).length);
  for (const mountain of mountains) {
    assert.equal(
      mountain.shape.spreadScale,
      fitted.values[mountain.semanticId],
      `${mountain.semanticId} did not carry its fitted control into the Scene Recipe`,
    );
  }
});

test("the production generator honours the persisted control", () => {
  const entity = ISLAND_SCENE_RECIPE.entities.find((row) => row.kind === "mountain");
  const boundsOf = (shape) => {
    const object = generateSceneObject("mountain", 12345, shape);
    object.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  };

  const narrow = boundsOf({ ...entity.shape, spreadScale: 0.4 });
  const wide = boundsOf({ ...entity.shape, spreadScale: 1.6 });
  assert.ok(wide.x > narrow.x * 1.5, "the control must actually change the generated form");

  // Generation stays deterministic under the persisted control.
  assert.deepEqual(
    boundsOf({ ...entity.shape, spreadScale: 0.4 }).toArray(),
    narrow.toArray(),
  );
});

test("the fitted artifact is compact and retains no reference data", () => {
  const serialized = JSON.stringify(fitted);
  // Semantic IDs encode world placement, so they contain digits by design.
  // What matters is how many numbers the artifact *carries*: one control per
  // Horizon Group, plus the declared search range.
  const payload = [...Object.values(fitted.values), ...Object.values(fitted.range)];

  assert.ok(
    payload.length <= Object.keys(fitted.values).length + 8,
    `the fitted artifact carries ${payload.length} numbers`,
  );
  assert.ok(payload.every(Number.isFinite));
  assert.doesNotMatch(serialized, /profile|samples|vertices|azimuth|pixels/i);
  assert.equal(history.retainedReferenceData, "none: no mesh, sample array, or pixel is persisted");
  assert.equal(history.numbersAdded, Object.keys(fitted.values).length);
});

test("an evaluation-only correction does not reach the generated scene", () => {
  const generated = generateScene(ISLAND_SCENE_RECIPE);
  const entity = ISLAND_SCENE_RECIPE.entities.find((row) => row.kind === "mountain");
  const record = generated.semanticIndex.get(entity.semanticId);
  const before = new THREE.Box3()
    .setFromObject(record.object)
    .getSize(new THREE.Vector3())
    .toArray();

  // A fitter that "corrects" the observation instead of the Recipe: mutate the
  // semantic index entry that evaluation reads.
  record.extent = [record.extent[0] * 0.5, record.extent[1], record.extent[2] * 0.5];
  record.orientation = { type: "axis", radians: 1.2 };

  const after = new THREE.Box3()
    .setFromObject(record.object)
    .getSize(new THREE.Vector3())
    .toArray();
  assert.deepEqual(
    after,
    before,
    "the generated scene must be unmoved by an evaluation-side edit, so such a fix cannot pass",
  );
});

test("the history names the discrepancy and the production change", () => {
  assert.match(history.tracer, /Horizon Group/);
  assert.ok(history.measuredDiscrepancy.length > 40);
  assert.match(history.productionChange, /Scene Recipe/);
  assert.match(history.referenceEvidence, /read-only/);
  assert.equal(history.controlsAdded, 16);
});
