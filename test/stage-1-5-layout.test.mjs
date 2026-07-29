import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { LAB_SCENE } from "../gt_designer/single-mesh-lab/scene-config.js";
import {
  createEightObjectLabAssembly,
  EIGHT_OBJECT_LAB_LAYOUT_VERSION,
  EIGHT_OBJECT_LAB_PLACEMENTS,
} from "../gt_designer/src/reconstruction/stage-1-5-layout.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];
    materials.forEach((material) => material.dispose());
  });
}

test("Stage 2 populates all matching slots in the eight-object Lab layout", async () => {
  const evidence = JSON.parse(
    await readFile(
      path.join(
        PROJECT_ROOT,
        "gt_designer/single-mesh-lab/ground-truth/evidence-v1.json",
      ),
      "utf8",
    ),
  );
  const expectedIds = LAB_SCENE.objects.map(({ id }) => id);
  assert.equal(LAB_SCENE.objects.length, 8);
  assert.equal(
    EIGHT_OBJECT_LAB_LAYOUT_VERSION,
    "stage-2-eight-object-lab-layout-v1",
  );
  assert.deepEqual(
    EIGHT_OBJECT_LAB_PLACEMENTS.map(({ objectId }) => objectId),
    expectedIds,
  );
  for (const scenePlacement of EIGHT_OBJECT_LAB_PLACEMENTS) {
    const reference = evidence.objects.find(
      ({ id }) => id === scenePlacement.objectId,
    );
    const labSpec = LAB_SCENE.objects.find(
      ({ id }) => id === scenePlacement.objectId,
    );
    assert.deepEqual(scenePlacement.position, [
      labSpec.slot[0],
      labSpec.slot[1] + 0.01,
      labSpec.slot[2],
    ]);
    assert.ok(
      Math.abs(
        scenePlacement.displayScale -
          LAB_SCENE.canonicalMaxDimension /
            reference.sourceWorldBounds.largestDimension,
      ) < 1e-12,
    );
  }

  const assembly = createEightObjectLabAssembly();
  try {
    assert.equal(
      assembly.root.userData.semanticId,
      "single-mesh.stage-2.eight-object-lab-layout",
    );
    assert.equal(assembly.entries.length, 8);
    assert.equal(new Set(assembly.entries.map(({ root }) => root.userData.semanticId)).size, 8);
    for (const { placement, root } of assembly.entries) {
      assert.deepEqual(root.scale.toArray(), [
        placement.displayScale,
        placement.displayScale,
        placement.displayScale,
      ]);
      const bounds = new THREE.Box3().setFromObject(root);
      assert.ok(Math.abs(bounds.min.y - placement.position[1]) < 1e-5);
      assert.ok(
        Math.abs((bounds.min.x + bounds.max.x) * 0.5 - placement.position[0]) < 1e-5,
      );
      assert.ok(
        Math.abs((bounds.min.z + bounds.max.z) * 0.5 - placement.position[2]) < 1e-5,
      );
      const size = bounds.getSize(new THREE.Vector3());
      assert.ok(
        Math.abs(
          Math.max(size.x, size.y, size.z) - LAB_SCENE.canonicalMaxDimension,
        ) < 0.5,
      );
    }
  } finally {
    dispose(assembly.root);
  }
});
