import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";

import { generateObject } from "../gt_designer/src/reconstruction/core/object-generator.js";
import { generateStonePath } from "../gt_designer/src/reconstruction/objects/stone-path-generator.js";
import { STONE_PATH_RECIPE } from "../gt_designer/src/reconstruction/objects/stone-path-recipe.js";
import { analyzeTriangleMesh } from "../tools/ground-truth/mesh-analysis.mjs";
import { deterministicGenerationEvidence } from "../tools/acceptance/runtime-evidence.mjs";

const makeStonePath = () =>
  generateObject(STONE_PATH_RECIPE, generateStonePath);

test("Stone Path is a deterministic closed one-draw shallow extrusion", () => {
  const root = makeStonePath();
  const position = root.geometry.getAttribute("position");
  const analysis = analyzeTriangleMesh({
    positions: Array.from(position.array),
    indices: Array.from({ length: position.count }, (_, index) => index),
  });
  assert.equal(root.userData.semanticId, "island.path.stone-path");
  assert.equal(root.isMesh, true);
  assert.equal(position.count / 3, 36);
  assert.equal(analysis.isClosed, true);
  assert.equal(analysis.connectedComponentCount, 1);
  assert.equal(root.material.map, null);
  assert.equal(root.material.roughness, 0.78);
  assert.equal(root.material.metalness, 0);
  assert.equal(
    deterministicGenerationEvidence(makeStonePath, 3).byteStable,
    true,
  );
});

test("Stone Path remains in source units and its Reconstruction Frame", () => {
  const root = makeStonePath();
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const expected = new THREE.Vector3(
    9.131263732910156,
    0.6713123321533203,
    5.329113006591797,
  );
  for (const axis of ["x", "y", "z"]) {
    assert.ok(Math.abs(size[axis] - expected[axis]) / expected[axis] <= 0.02);
  }
  const bottomCenter = new THREE.Vector3(
    (bounds.min.x + bounds.max.x) * 0.5,
    bounds.min.y,
    (bounds.min.z + bounds.max.z) * 0.5,
  );
  assert.ok(bottomCenter.length() <= 0.02);
  assert.deepEqual(root.position.toArray(), [0, 0, 0]);
  assert.deepEqual(root.scale.toArray(), [1, 1, 1]);
});

test("Stone Path recipe stays compact and exposes semantic controls", () => {
  assert.equal(STONE_PATH_RECIPE.shape.footprint.length, 10);
  assert.deepEqual(STONE_PATH_RECIPE.shape.hardSideCorners, [2, 6, 9]);
  assert.ok(Buffer.byteLength(JSON.stringify(STONE_PATH_RECIPE)) <= 1024);
});
