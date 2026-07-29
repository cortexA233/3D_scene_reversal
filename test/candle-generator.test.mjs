import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { generateCandle } from "../gt_designer/src/reconstruction/objects/candle-generator.js";
import { CANDLE_RECIPE } from "../gt_designer/src/reconstruction/objects/candle-recipe.js";

test("Candle generates a compact three-part profiled pedestal assembly", () => {
  const root = generateCandle(CANDLE_RECIPE);
  const meshes = [];
  root.traverse((object) => { if (object.isMesh) meshes.push(object); });
  assert.equal(meshes.length, 3);
  assert.equal(root.userData.semanticId, CANDLE_RECIPE.id);
  const bounds = new THREE.Box3().setFromObject(root);
  assert.ok(Math.abs(bounds.min.y) < 1e-7);
  assert.ok(bounds.max.y > 2.93 && bounds.max.y < 2.96);
  assert.ok(bounds.max.x - bounds.min.x > 1.79);
  assert.ok(bounds.max.x - bounds.min.x < 1.81);
  assert.equal(meshes[0].geometry.index.count / 3, 480);
  assert.ok(meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0) <= 2048);
});
