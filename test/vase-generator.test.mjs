import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { generateObject } from "../gt_designer/src/reconstruction/core/object-generator.js";
import { generateVase } from "../gt_designer/src/reconstruction/objects/vase-generator.js";
import { VASE_RECIPE } from "../gt_designer/src/reconstruction/objects/vase-recipe.js";

test("Vase generates one deterministic textured hollow lathe", () => {
  const root = generateObject(VASE_RECIPE, generateVase);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  assert.equal(root.userData.semanticId, "island.decor.vase");
  assert.equal(root.geometry.type, "LatheGeometry");
  assert.equal(root.material.vertexColors, true);
  assert.equal(root.material.map, null);
  assert.ok(root.geometry.getAttribute("color"));
  assert.ok(Math.abs(bounds.min.y) < 1e-7);
  assert.ok(Math.abs(size.y - 3.904) / 3.904 < 0.02);
  assert.ok(root.geometry.index.count / 3 <= 1100);
});
