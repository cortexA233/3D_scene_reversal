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

const massing = JSON.parse(
  await readFile(
    path.join(
      PROJECT_ROOT,
      ".scratch/full-island-reconstruction/evidence/axial-massing-v1.json",
    ),
    "utf8",
  ),
);
const AXIAL_KINDS = ["lantern", "npc-statue"];

/**
 * Recorded when the axial decorations landed. Regression guards, not gates.
 */
const RECORDED = Object.freeze({
  lanternSurfaceP95: 3.5,
  npcStatueSurfaceP95: 3.7,
  aggregateSurfaceP95: 7.2,
});

function measuredKind(kind) {
  const row = massing.kinds.find((entry) => entry.kind === kind);
  assert.ok(row, `${kind} is not in the axial massing evidence`);
  return row;
}

test("the axial decorations follow their measured reach profile", () => {
  // Both profiles come from tools/development/measure-architecture-massing.mjs,
  // which puts the two subjects through one sampler. This reads that comparison
  // rather than recomputing it: the lathe's vertices cluster at its profile points
  // while an area-weighted sample does not, so a vertex-based check reported a
  // 1.27 scale factor that was a difference between two methods, not a shape error.
  // That is the mistake ADR-0055 was written about.
  for (const kind of AXIAL_KINDS) {
    const { authored, candidate, placements } = measuredKind(kind);
    assert.ok(placements >= 8, `${kind} has only ${placements} placements`);
    for (let decile = 0; decile < authored.reach.length; decile += 1) {
      assert.notEqual(
        candidate.reach[decile],
        null,
        `${kind} has no generated geometry in decile ${decile}`,
      );
    }
    // The profile is the shape; the Target AABB Extent sets the size.
    const total = (values) => values.reduce((sum, value) => sum + value, 0);
    const scale = total(candidate.reach) / total(authored.reach);
    assert.ok(scale > 0.9 && scale < 1.15, `${kind} profile scaled by ${scale.toFixed(3)}`);
    const errors = authored.reach.map((value, decile) =>
      Math.abs(candidate.reach[decile] / scale - value),
    );
    const meanError = total(errors) / errors.length;
    assert.ok(meanError <= 0.06, `${kind} mean reach error is ${meanError.toFixed(4)}`);
  }
});

test("the widest band and the narrowest band are where the reference put them", () => {
  // A mean error can be small while the form is still upside down, which is exactly
  // how the previous lantern passed a profile eyeball and inverted the silhouette.
  for (const kind of AXIAL_KINDS) {
    const { authored: left, candidate: right } = measuredKind(kind);
    const authored = left.reach;
    const built = right.reach;
    const widest = (values) => values.indexOf(Math.max(...values));
    const narrowest = (values) => values.indexOf(Math.min(...values));
    assert.ok(
      Math.abs(widest(built) - widest(authored)) <= 2,
      `${kind} is widest at decile ${widest(built)}, authored ${widest(authored)}`,
    );
    assert.ok(
      Math.abs(narrowest(built) - narrowest(authored)) <= 2,
      `${kind} is narrowest at decile ${narrowest(built)}, authored ${narrowest(authored)}`,
    );
  }
});

test("an axial decoration is one smooth surface, locally framed and deterministic", () => {
  for (const kind of ["lantern", "npc-statue"]) {
    const form = generateSceneObject(kind, 11);
    form.updateMatrixWorld(true);
    let meshes = 0;
    let triangles = 0;
    form.traverse((child) => {
      if (!child.isMesh) return;
      meshes += 1;
      const position = child.geometry.attributes.position;
      const index = child.geometry.index;
      triangles += Math.floor((index ? index.count : position.count) / 3);
    });
    // One revolved surface, not a stack of primitives: the reverted architecture
    // attempt matched its profile and raised contour distance a fifth by adding
    // silhouette seams the authored body does not have.
    assert.equal(meshes, 1, `${kind} emits ${meshes} meshes`);
    assert.ok(triangles > 200, `${kind} has only ${triangles} triangles`);

    const bounds = new THREE.Box3().setFromObject(form);
    const centre = bounds.getCenter(new THREE.Vector3());
    assert.ok(Math.abs(centre.x) <= 1e-5 && Math.abs(centre.z) <= 1e-5);
    assert.ok(Math.abs(bounds.min.y) <= 1e-5);

    const again = new THREE.Box3().setFromObject(generateSceneObject(kind, 11));
    assert.deepEqual(
      again.getSize(new THREE.Vector3()).toArray(),
      bounds.getSize(new THREE.Vector3()).toArray(),
      `${kind} is not deterministic`,
    );
  }
});

test("the measured decoration result has not regressed", () => {
  const byKind = correspondence.surface.byKind;
  assert.ok(
    byKind.lantern.mean <= RECORDED.lanternSurfaceP95,
    `lantern surface p95 ${byKind.lantern.mean} regressed past ${RECORDED.lanternSurfaceP95}`,
  );
  assert.ok(
    byKind["npc-statue"].mean <= RECORDED.npcStatueSurfaceP95,
    `npc-statue surface p95 ${byKind["npc-statue"].mean} regressed`,
  );
  assert.ok(
    correspondence.surface.p95.mean <= RECORDED.aggregateSurfaceP95,
    `aggregate surface p95 ${correspondence.surface.p95.mean} regressed`,
  );
});
