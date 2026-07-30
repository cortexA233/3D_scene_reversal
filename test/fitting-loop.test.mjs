import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { generateScene } from "../gt_designer/src/reconstruction/scene/scene-generator.js";
import { generateSceneObject } from "../gt_designer/src/reconstruction/scene/scene-object-generators.js";
import {
  GROUP_CONTROLS,
  SUMMIT_CONTROLS,
} from "../tools/reconstruction/fit-horizon-ridge.mjs";

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
    path.join(PROJECT_ROOT, "tools/reconstruction/fitted/horizon-ridge-v1.json"),
    "utf8",
  ).then(JSON.parse),
]);

const boundsFor = new Map(
  [...GROUP_CONTROLS, ...SUMMIT_CONTROLS].map((control) => [control.name, control]),
);

test("the loop improved the metric it declared it was targeting", () => {
  assert.equal(history.metric, "horizon.groups.silhouetteError.mean");
  assert.ok(history.after < history.before, `${history.before} -> ${history.after}`);
  assert.equal(history.unrelatedEntitiesDrifted, 0);
  assert.ok(history.unrelatedEntitiesChecked >= 50);
  // The combined skyline is a max across overlapping groups, so improving every
  // group need not improve it: the loop has to show it did both.
  assert.ok(
    history.combinedProfileP95.after < history.combinedProfileP95.before,
    "the loop did not improve the combined Horizon Profile",
  );
  assert.ok(
    history.combinedProfileMax.after < history.combinedProfileMax.before,
    "the loop did not improve the worst azimuth",
  );
  for (const row of history.perGroup) {
    assert.ok(row.after.p95 <= row.before.p95, `${row.semanticId} got worse`);
    // A narrowed summit lowers the angle by not being there, and a ridge at the
    // wrong distance reaches the right angle from the wrong place. Neither may
    // be what a group's improvement is made of.
    assert.ok(
      row.after.uncovered <= row.before.uncovered,
      `${row.semanticId} dropped azimuth the reference covers`,
    );
    if (!row.controls) continue;
    for (const [name, value] of Object.entries(row.controls)) {
      const bounds = boundsFor.get(name);
      assert.ok(bounds, `${name} is not a declared control`);
      assert.ok(
        value >= bounds.minimum && value <= bounds.maximum,
        `${row.semanticId} ${name} ${value} is outside its declared range`,
      );
    }
    for (const summit of [...row.summits.peaks, ...row.summits.foothills]) {
      for (const control of SUMMIT_CONTROLS) {
        const value = summit[control.name];
        assert.ok(
          value >= control.minimum && value <= control.maximum,
          `${row.semanticId} summit ${control.name} ${value} is outside its declared range`,
        );
      }
    }
  }
});

test("the correction is persisted in the Scene Recipe, not in an evaluation artifact", () => {
  const mountains = ISLAND_SCENE_RECIPE.entities.filter((entity) => entity.kind === "mountain");

  assert.equal(mountains.length, Object.keys(fitted.values).length);
  for (const mountain of mountains) {
    const value = fitted.values[mountain.semanticId];
    for (const [name, control] of Object.entries(value.controls)) {
      assert.equal(
        mountain.shape[name],
        control,
        `${mountain.semanticId} did not carry its fitted ${name} into the Scene Recipe`,
      );
    }
    for (const family of ["peaks", "foothills"]) {
      value.summits[family].forEach((summit, index) => {
        assert.equal(mountain.shape[family][index].height, summit.height);
        assert.equal(mountain.shape[family][index].radius, summit.radius);
      });
    }
  }
});

test("the production generator honours the persisted controls", () => {
  const entity = ISLAND_SCENE_RECIPE.entities.find((row) => row.kind === "mountain");
  const measure = (shape) => {
    const object = generateSceneObject("mountain", 12345, shape);
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    return { size: box.getSize(new THREE.Vector3()), box, object };
  };

  const narrow = measure({ ...entity.shape, spreadScale: 0.4 });
  const wide = measure({ ...entity.shape, spreadScale: 1.6 });
  assert.ok(
    wide.size.x > narrow.size.x * 1.2 || wide.size.z > narrow.size.z * 1.2,
    "the breadth control must actually change the generated form",
  );

  // Each control has to move something, or it is a number the Recipe carries for
  // nothing. Compared on the generated vertices, because several of them reshape
  // the ridge inside a bounding box that the extent pins anyway.
  const digest = (shape) => {
    const { object } = measure(shape);
    const parts = [];
    object.traverse((child) => {
      if (child.isMesh) parts.push(child.geometry.attributes.position.array.join(","));
    });
    return parts.join("|");
  };
  // Moved relative to whatever this group was fitted to, and away from the range
  // it is already nearest, so no control can look inert because the fit happened
  // to land on the value the check was about to try.
  const base = digest(entity.shape);
  for (const control of GROUP_CONTROLS) {
    const current = entity.shape[control.name];
    const away =
      current - control.minimum > control.maximum - current
        ? control.minimum + (current - control.minimum) * 0.4
        : control.maximum - (control.maximum - current) * 0.4;
    assert.notEqual(away, current, `${control.name} could not be moved`);
    assert.notEqual(
      digest({ ...entity.shape, [control.name]: away }),
      base,
      `${control.name} changes nothing, so it is a number the Recipe carries for nothing`,
    );
  }

  // Generation stays deterministic under the persisted controls.
  assert.equal(digest(entity.shape), base);
});

test("the fitted artifact is compact and retains no reference data", () => {
  const serialized = JSON.stringify(fitted);
  // Semantic IDs encode world placement, so they contain digits by design. What
  // matters is how many numbers the artifact *carries*: the group's controls
  // plus two per measured summit, against the 720 profile bins it was fitted to.
  const payload = Object.values(fitted.values).flatMap((value) => [
    ...Object.values(value.controls),
    ...[...value.summits.peaks, ...value.summits.foothills].flatMap((summit) => [
      summit.height,
      summit.radius,
    ]),
  ]);

  assert.ok(
    payload.length <= Object.keys(fitted.values).length * 24,
    `the fitted artifact carries ${payload.length} numbers`,
  );
  assert.ok(payload.every(Number.isFinite));
  assert.doesNotMatch(serialized, /profile|samples|vertices|azimuth|pixels/i);
  assert.equal(history.retainedReferenceData, "none: no mesh, sample array, or pixel is persisted");
  assert.equal(history.numbersAdded, payload.length);
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
