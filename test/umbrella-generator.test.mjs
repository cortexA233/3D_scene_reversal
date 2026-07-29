import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { generateObject } from "../gt_designer/src/reconstruction/core/object-generator.js";
import { generateUmbrella } from "../gt_designer/src/reconstruction/objects/umbrella-generator.js";
import { UMBRELLA_RECIPE } from "../gt_designer/src/reconstruction/objects/umbrella-recipe.js";

test("Umbrella compiles a radial assembly into two render batches", () => {
  const root = generateObject(UMBRELLA_RECIPE, generateUmbrella);
  const meshes = [];
  const semanticIds = new Set();
  root.traverse((part) => {
    if (part.isMesh) meshes.push(part);
    if (part.userData.semanticId) semanticIds.add(part.userData.semanticId);
  });
  const bounds = new THREE.Box3().setFromObject(root);
  const triangles = meshes.reduce(
    (sum, mesh) => sum + (mesh.geometry.index
      ? mesh.geometry.index.count / 3
      : mesh.geometry.getAttribute("position").count / 3),
    0,
  );
  assert.equal(root.userData.semanticId, "island.prop.umbrella");
  assert.equal(meshes.length, 2);
  assert.equal(new Set(meshes.map((mesh) => mesh.material)).size, 2);
  assert.equal(
    typeof meshes[0].material.userData.createAlbedoMaterial,
    "function",
  );
  assert.ok(Math.abs(bounds.min.y) < 1e-7);
  assert.ok(triangles <= 5760);
  for (const id of ["canopy", "hardware", "ribs", "shaft", "runner", "grip"]) {
    assert.ok(semanticIds.has(`${root.userData.semanticId}/${id}`));
  }
});
