import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { generateSceneObject } from "../gt_designer/src/reconstruction/scene/scene-object-generators.js";
import {
  canonicalSupportDirections,
  STONE_SUPPORT_DIRECTION_COUNT,
} from "../gt_designer/src/reconstruction/objects/stone-generator.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const supports = JSON.parse(
  await readFile(
    path.join(
      PROJECT_ROOT,
      ".scratch/full-island-reconstruction/evidence/rock-supports-v1.json",
    ),
    "utf8",
  ),
);
const correspondence = JSON.parse(
  await readFile(
    path.join(
      PROJECT_ROOT,
      ".scratch/scene-parity-foundation/evidence/scene-correspondence-v1.json",
    ),
    "utf8",
  ),
);
const authored = supports.kinds.find((row) => row.kind === "rock");

/**
 * Recorded when the support-plane rock landed. Regression guards, not gates: the
 * rendered layer's own thresholds are frozen elsewhere and this group is nowhere
 * near them.
 */
const RECORDED = Object.freeze({
  rockSurfaceP95Mean: 5.3,
  aggregateSurfaceP95Mean: 7.25,
});

/**
 * The generated rock's support distance along each canonical direction, measured
 * in the same normalised frame the authored profile was: the form's own AABB
 * scaled so each axis spans -1 to 1.
 */
function generatedProfile(seed) {
  const form = generateSceneObject("rock", seed);
  form.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(form);
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const directions = canonicalSupportDirections();
  const support = new Array(directions.length).fill(-Infinity);
  const local = new THREE.Vector3();
  form.traverse((child) => {
    if (!child.isMesh) return;
    const position = child.geometry.getAttribute("position");
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      local
        .fromBufferAttribute(position, vertex)
        .applyMatrix4(child.matrixWorld)
        .sub(centre);
      local.set((2 * local.x) / size.x, (2 * local.y) / size.y, (2 * local.z) / size.z);
      directions.forEach((direction, index) => {
        const projected = local.dot(direction);
        if (projected > support[index]) support[index] = projected;
      });
    }
  });
  return support;
}

test("a rock is the accepted support-plane representation, not a stretched sphere", () => {
  // A sphere inscribed in a box touches the six face centres and falls short
  // everywhere else, which is why the previous jittered-sphere rock sat inside the
  // authored form in 23 of the 24 canonical directions.
  const profile = generatedProfile(4242);
  assert.equal(profile.length, STONE_SUPPORT_DIRECTION_COUNT);

  const directions = canonicalSupportDirections();
  // The eight upward-leaning directions are where the authored mass fills its
  // corners and a sphere cannot follow.
  const leaning = directions
    .map((direction, index) => ({ direction, index }))
    .filter(({ direction }) => direction.y > 0.9 && direction.y < 1);
  assert.equal(leaning.length, 8, "the canonical direction set changed shape");
  for (const { index } of leaning) {
    assert.ok(
      profile[index] > 0.75,
      `direction ${index} reaches only ${profile[index].toFixed(3)}; a sphere in a box reaches about 0.7 here`,
    );
  }
});

test("the generated support profile is no longer systematically inside the authored one", () => {
  // Both profiles come from tools/development/measure-rock-supports.mjs, which
  // measures the two subjects from the same frozen samples. This test reads that
  // result rather than recomputing it: the generated form's vertices reach its AABB
  // walls exactly while a 96-sample authored profile cannot, so a vertex-based
  // comparison would report a structural sampling difference as a shape error —
  // which is the mistake ADR-0055 was written about.
  const reference = authored.referenceSupport;
  const candidate = authored.candidateSupport;
  assert.equal(candidate.length, STONE_SUPPORT_DIRECTION_COUNT);

  // Absolute level carries no information; the Target AABB Extent rescales the form.
  const total = (values) => values.reduce((sum, value) => sum + value, 0);
  const scale = total(candidate) / total(reference);
  assert.ok(scale > 0.9 && scale < 1.1, `the generated profile is scaled by ${scale.toFixed(3)}`);

  // The jittered sphere sat inside the authored form in 23 of 24 directions and
  // averaged 0.838 against 0.941. That systematic shortfall is what this fixes.
  assert.ok(
    authored.directionsInsideReference <= 12,
    `the generated rock is inside the authored form in ${authored.directionsInsideReference} of ${candidate.length} directions`,
  );
  // Mean absolute error over the 24 directions, which is the summary the change
  // was made against: 0.0428 now, against a systematic 0.103 shortfall before.
  // A worst-direction bound was tried first and had no measured basis — the
  // authored population's own per-direction spread runs to 0.17, so a single
  // direction says less than the profile does.
  const errors = reference.map((value, index) => Math.abs(candidate[index] / scale - value));
  const meanError = errors.reduce((sum, value) => sum + value, 0) / errors.length;
  assert.ok(meanError <= 0.055, `mean profile error is ${meanError.toFixed(4)}`);

  // The one direction that still disagrees, named rather than hidden: [0.23, 0.45,
  // -0.86] is 0.188 out, about 2.2 times the authored spread of 0.087 there. It is
  // a real single-direction disagreement and it is not what this change was for.
  assert.ok(
    errors.filter((value) => value > 0.12).length <= 1,
    `${errors.filter((value) => value > 0.12).length} directions disagree by more than 0.12`,
  );
});

test("the direction set is shared with the Stone milestone rather than restated", () => {
  // Two copies of a definition is how the reference and the candidate came to
  // disagree while both formulas read identically (ADR-0055). If the scene module
  // ever grows its own copy, this is what should notice.
  const source = generatedProfile(11);
  const directions = canonicalSupportDirections();
  assert.equal(source.length, directions.length);
  assert.equal(directions.length, STONE_SUPPORT_DIRECTION_COUNT);
  const unique = new Set(directions.map((d) => `${d.x.toFixed(4)},${d.y.toFixed(4)},${d.z.toFixed(4)}`));
  assert.equal(unique.size, directions.length, "the canonical directions are not distinct");
  for (const direction of directions) {
    assert.ok(Math.abs(direction.length() - 1) < 1e-6, "a canonical direction is not a unit vector");
  }
});

test("rocks vary between placements and each one is deterministic", () => {
  const first = generatedProfile(7);
  assert.deepEqual(generatedProfile(7), first, "the same seed built a different rock");
  const other = generatedProfile(8);
  assert.notDeepEqual(other, first, "two seeds built the same rock");
  // The spread is a family control, so the variation has to stay inside it rather
  // than becoming a second shape.
  for (let index = 0; index < first.length; index += 1) {
    assert.ok(
      Math.abs(other[index] - first[index]) < 0.5,
      `direction ${index} varies by ${Math.abs(other[index] - first[index]).toFixed(3)} between seeds`,
    );
  }
});

test("the measured rock result has not regressed", () => {
  const byKind = correspondence.surface.byKind;
  assert.ok(
    byKind.rock.mean <= RECORDED.rockSurfaceP95Mean,
    `rock surface p95 ${byKind.rock.mean} regressed past ${RECORDED.rockSurfaceP95Mean}`,
  );
  assert.ok(
    correspondence.surface.p95.mean <= RECORDED.aggregateSurfaceP95Mean,
    `aggregate surface p95 ${correspondence.surface.p95.mean} regressed`,
  );
});
