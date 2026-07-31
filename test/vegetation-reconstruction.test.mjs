import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { generateSceneObject } from "../gt_designer/src/reconstruction/scene/scene-object-generators.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
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

/**
 * Recorded when the canopies landed. These are regression guards, not parity
 * gates: the fixed-camera and appearance layers have no calibrated thresholds
 * yet, so this ticket must not be allowed to silently give ground it gained.
 */
/**
 * The ratchet, and one re-baselining with its reason.
 *
 * `palmSurfaceP95` was 6.5 and is 6.8. Palm's generated geometry is byte-identical —
 * nothing in this ticket's forms changed — and what moved was the measurement: ADR-0055
 * gave the surface sampler's budget to the entity rather than to each of its meshes, so
 * a palm's three parts no longer draw a per-mesh budget each and its measured p95 went
 * from 5.80 to 6.52 on both subjects at once.
 *
 * Re-baselining a ratchet because the measurement changed is the move that could hide a
 * real regression, so the two facts that make it safe are recorded rather than implied:
 * the candidate's palm geometry is unchanged, and the same correction took the aggregate
 * from 9.3025 to 7.2469 and `bamboo` from 29.01 to 7.34. A ratchet whose baseline was
 * measured by a different rule is not a ratchet; it is a comparison between two
 * different things.
 */
/**
 * Ratchets, not gates. Each is the measured value with a little headroom, tightened
 * whenever one improves so a later change cannot quietly give the ground back.
 *
 * `palm` came down from 5.4025 when its form controls were fitted to the measured
 * profile — the whorls spread down the trunk rather than gathered at its crown — and the
 * ceiling comes down with it. It was 6.8 for a form that measured 5.4, which is slack
 * wide enough to have hidden the whole regression the fit removed.
 */
const RECORDED = Object.freeze({
  palmSurfaceP95: 5.1,
  blossomSurfaceP95: 3.5,
  aggregateSurfaceP95: 6.6,
});

function measure(kind, seed) {
  const object = generateSceneObject(kind, seed);
  object.updateMatrixWorld(true);
  let meshes = 0;
  let triangles = 0;
  object.traverse((child) => {
    if (!child.isMesh) return;
    meshes += 1;
    const position = child.geometry.attributes.position;
    const index = child.geometry.index;
    triangles += Math.floor((index ? index.count : position.count) / 3);
  });
  const bounds = new THREE.Box3().setFromObject(object);
  return { meshes, triangles, size: bounds.getSize(new THREE.Vector3()) };
}

test("a canopy is one semantic part, not one part per blade", () => {
  // Emitting a mesh per blade multiplied draw calls by an order of magnitude
  // and claimed far more parts than the authored objects have.
  for (const [kind, maximumMeshes] of [
    ["palm", 3],
    ["blossom", 3],
    ["bamboo", 2],
    ["willow", 4],
    ["grass-clump", 1],
  ]) {
    const measured = measure(kind, 4242);
    assert.ok(
      measured.meshes <= maximumMeshes,
      `${kind} emits ${measured.meshes} meshes, above its ${maximumMeshes} semantic parts`,
    );
    assert.ok(measured.triangles > 100, `${kind} has only ${measured.triangles} triangles`);
  }
});

test("canopies carry real foliage mass rather than a handful of cards", () => {
  // A frond fan of flat planes reads as sticks at overview distance. Blade
  // geometry is what makes the crown a surface.
  for (const [kind, minimumTriangles] of [
    ["palm", 400],
    ["blossom", 600],
    ["bamboo", 500],
  ]) {
    const measured = measure(kind, 991);
    assert.ok(
      measured.triangles >= minimumTriangles,
      `${kind} has ${measured.triangles} triangles, below the ${minimumTriangles} a canopy needs`,
    );
  }
});

test("vegetation generation stays deterministic and locally framed", () => {
  for (const kind of ["palm", "blossom", "bamboo", "willow", "grass-clump"]) {
    const first = measure(kind, 7);
    const second = measure(kind, 7);
    assert.deepEqual(second.size.toArray(), first.size.toArray(), `${kind} is not deterministic`);
    assert.equal(second.meshes, first.meshes);

    const object = generateSceneObject(kind, 7);
    object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object);
    const centre = bounds.getCenter(new THREE.Vector3());
    assert.ok(Math.abs(centre.x) <= 1e-5 && Math.abs(centre.z) <= 1e-5);
    assert.ok(Math.abs(bounds.min.y) <= 1e-5);
  }
});

test("the measured vegetation result has not regressed", () => {
  const byKind = correspondence.surface.byKind;

  assert.ok(
    byKind.palm.mean <= RECORDED.palmSurfaceP95,
    `palm surface p95 ${byKind.palm.mean} regressed past ${RECORDED.palmSurfaceP95}`,
  );
  assert.ok(
    byKind.blossom.mean <= RECORDED.blossomSurfaceP95,
    `blossom surface p95 ${byKind.blossom.mean} regressed past ${RECORDED.blossomSurfaceP95}`,
  );
  assert.ok(
    correspondence.surface.p95.mean <= RECORDED.aggregateSurfaceP95,
    `aggregate surface p95 ${correspondence.surface.p95.mean} regressed`,
  );
});
