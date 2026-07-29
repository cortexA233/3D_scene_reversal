import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import * as THREE from "three";

import {
  assertObjectRecipe,
  generateObject,
} from "../gt_designer/src/reconstruction/core/object-generator.js";
import {
  generateProbe,
  PROBE_RECIPE,
} from "../gt_designer/src/reconstruction/testing/probe-generator.js";

function hashArray(array) {
  return createHash("sha256")
    .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength))
    .digest("hex");
}

function snapshot(root) {
  const objects = [];
  let triangles = 0;
  let drawCalls = 0;
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const record = {
      id: object.userData.semanticId ?? null,
      type: object.type,
      position: object.position.toArray(),
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
      scale: object.scale.toArray(),
    };
    if (object.isMesh) {
      drawCalls += 1;
      const geometry = object.geometry;
      const geometryRecord = { attributes: {} };
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        geometryRecord.attributes[name] = {
          length: attribute.array.length,
          hash: hashArray(attribute.array),
        };
      }
      if (geometry.index) {
        geometryRecord.index = {
          length: geometry.index.array.length,
          hash: hashArray(geometry.index.array),
        };
        triangles += geometry.index.count / 3;
      } else {
        triangles += geometry.attributes.position.count / 3;
      }
      record.geometry = geometryRecord;
      record.material = {
        color: object.material.color.getHex(),
        roughness: object.material.roughness,
        metalness: object.material.metalness,
      };
    }
    objects.push(record);
  });

  const bounds = new THREE.Box3().setFromObject(root);
  return {
    objects,
    bounds: {
      min: bounds.min.toArray(),
      max: bounds.max.toArray(),
    },
    triangles,
    drawCalls,
  };
}

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose();
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => material.dispose());
    } else {
      object.material?.dispose();
    }
  });
}

test("recipe contract rejects missing or ambiguous fields", () => {
  assert.equal(assertObjectRecipe(PROBE_RECIPE), PROBE_RECIPE);
  assert.throws(() => assertObjectRecipe(null), /recipe must be an object/);
  assert.throws(
    () => assertObjectRecipe({ ...PROBE_RECIPE, id: "" }),
    /recipe.id/,
  );
  assert.throws(
    () => assertObjectRecipe({ ...PROBE_RECIPE, seed: -1 }),
    /recipe.seed/,
  );
  assert.throws(
    () => assertObjectRecipe({ ...PROBE_RECIPE, shape: [] }),
    /recipe.shape/,
  );
});

test("probe generation is byte-stable and uses semantic IDs", () => {
  const first = generateObject(PROBE_RECIPE, generateProbe);
  const second = generateObject(PROBE_RECIPE, generateProbe);
  try {
    const firstSnapshot = snapshot(first);
    assert.deepEqual(firstSnapshot, snapshot(second));
    assert.deepEqual(
      firstSnapshot.objects.map((object) => object.id),
      ["test.probe", "test.probe/body", "test.probe/beacon"],
    );
    assert.equal(firstSnapshot.drawCalls, 2);
    assert.ok(firstSnapshot.triangles > 0);
  } finally {
    dispose(first);
    dispose(second);
  }
});

test("probe root is identity-local with a bottom-center Reconstruction Frame", () => {
  const root = generateObject(PROBE_RECIPE, generateProbe);
  try {
    assert.deepEqual(root.position.toArray(), [0, 0, 0]);
    assert.deepEqual(root.rotation.toArray().slice(0, 3), [0, 0, 0]);
    assert.deepEqual(root.scale.toArray(), [1, 1, 1]);
    const bounds = new THREE.Box3().setFromObject(root);
    assert.ok(Math.abs(bounds.min.y) < 1e-6);
    assert.ok(Math.abs((bounds.min.x + bounds.max.x) * 0.5) < 1e-6);
    assert.ok(Math.abs((bounds.min.z + bounds.max.z) * 0.5) < 1e-6);
    assert.ok(Math.abs(bounds.max.y - 3) < 1e-6);
  } finally {
    dispose(root);
  }
});

test("generator must return the recipe's stable semantic root", () => {
  assert.throws(() => generateObject(PROBE_RECIPE, () => null), /Object3D/);
  assert.throws(
    () =>
      generateObject(PROBE_RECIPE, () => {
        const root = new THREE.Group();
        root.userData.semanticId = "wrong";
        return root;
      }),
    /semantic ID/,
  );
});
