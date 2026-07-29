import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import {
  createStage15Assembly,
  STAGE_1_5_LAYOUT_VERSION,
  STAGE_1_5_PLACEMENTS,
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

test("Stage 1.5 assembles four replacements at reference world positions", async () => {
  const evidence = JSON.parse(
    await readFile(
      path.join(
        PROJECT_ROOT,
        "gt_designer/single-mesh-lab/ground-truth/evidence-v1.json",
      ),
      "utf8",
    ),
  );
  const expectedIds = ["stone-path", "stone", "vase", "umbrella"];
  assert.equal(STAGE_1_5_LAYOUT_VERSION, "stage-1-5-reference-layout-v1");
  assert.deepEqual(
    STAGE_1_5_PLACEMENTS.map(({ objectId }) => objectId),
    expectedIds,
  );
  for (const scenePlacement of STAGE_1_5_PLACEMENTS) {
    const reference = evidence.objects.find(
      ({ id }) => id === scenePlacement.objectId,
    );
    assert.deepEqual(scenePlacement.position, reference.sourceWorldBounds.bottomCenter);
  }

  const assembly = createStage15Assembly();
  try {
    assert.equal(assembly.root.userData.semanticId, "island.stage-1-5.reference-layout");
    assert.equal(assembly.entries.length, 4);
    assert.equal(new Set(assembly.entries.map(({ root }) => root.userData.semanticId)).size, 4);
    for (const { placement, root } of assembly.entries) {
      assert.deepEqual(root.position.toArray(), placement.position);
      const bounds = new THREE.Box3().setFromObject(root);
      assert.ok(Math.abs(bounds.min.y - placement.position[1]) < 1e-5);
    }
  } finally {
    dispose(assembly.root);
  }
});
