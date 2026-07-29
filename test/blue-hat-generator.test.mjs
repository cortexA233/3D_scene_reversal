import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { generateBlueHat } from "../gt_designer/src/reconstruction/objects/blue-hat-generator.js";
import { BLUE_HAT_RECIPE } from "../gt_designer/src/reconstruction/objects/blue-hat-recipe.js";

test("Blue Hat generates an exact compact double-profile assembly", () => {
  const root = generateBlueHat(BLUE_HAT_RECIPE);
  const meshes = [];
  root.traverse((object) => { if (object.isMesh) meshes.push(object); });
  assert.equal(meshes.length, 2);
  assert.equal(root.userData.semanticId, BLUE_HAT_RECIPE.id);
  const bounds = new THREE.Box3().setFromObject(root);
  assert.ok(bounds.min.y > 0 && bounds.min.y < 0.005);
  assert.ok(bounds.max.y > 1.345 && bounds.max.y < 1.347);
  assert.equal(meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0), 704);
});
