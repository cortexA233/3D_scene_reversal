import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { generateMushroom } from "../gt_designer/src/reconstruction/objects/mushroom-generator.js";
import { MUSHROOM_RECIPE } from "../gt_designer/src/reconstruction/objects/mushroom-recipe.js";

test("Mushroom generates a compact two-batch five-form cluster", () => {
  const root = generateMushroom(MUSHROOM_RECIPE);
  const meshes = [];
  root.traverse((object) => { if (object.isMesh) meshes.push(object); });
  assert.equal(meshes.length, 2);
  assert.equal(root.userData.semanticId, MUSHROOM_RECIPE.id);
  const bounds = new THREE.Box3().setFromObject(root);
  assert.ok(Math.abs(bounds.min.y) < 1e-6);
  assert.ok(bounds.max.y > MUSHROOM_RECIPE.shape.forms[0][8] * 0.99);
  assert.ok(meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0) < 3840);
});
