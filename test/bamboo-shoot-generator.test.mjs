import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { generateBambooShoot } from "../gt_designer/src/reconstruction/objects/bamboo-shoot-generator.js";
import { BAMBOO_SHOOT_RECIPE } from "../gt_designer/src/reconstruction/objects/bamboo-shoot-recipe.js";

test("Bamboo Shoot generates a two-batch open axial assembly", () => {
  const root = generateBambooShoot(BAMBOO_SHOOT_RECIPE);
  const meshes = [];
  root.traverse((object) => { if (object.isMesh) meshes.push(object); });
  assert.equal(meshes.length, 2);
  assert.equal(root.userData.semanticId, BAMBOO_SHOOT_RECIPE.id);
  const bounds = new THREE.Box3().setFromObject(root);
  assert.ok(Math.abs(bounds.min.y) < 1e-6);
  assert.ok(bounds.max.y > BAMBOO_SHOOT_RECIPE.shape.coreRings.at(-1)[1]);
  assert.ok(meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0) < 1536);
});
