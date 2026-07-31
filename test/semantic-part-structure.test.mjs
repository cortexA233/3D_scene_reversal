import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { generateSceneObject } from "../gt_designer/src/reconstruction/scene/scene-object-generators.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const correspondence = JSON.parse(
  await readFile(
    path.join(
      PROJECT_ROOT,
      ".scratch/scene-parity-foundation/evidence/scene-correspondence-v1.json",
    ),
    "utf8",
  ),
);
const authoredParts = JSON.parse(
  await readFile(
    path.join(
      PROJECT_ROOT,
      ".scratch/full-island-reconstruction/evidence/creature-parts-v1.json",
    ),
    "utf8",
  ),
);

/**
 * The gate for ticket 10 lives in the frozen baseline as `worst component
 * deficit`, calibrated at 3.5. These are the ratchets underneath it: a deficit
 * of zero is the state this ticket reached, and the deficit is the metric that
 * may not give ground.
 *
 * `componentDelta` is deliberately absent. Nearly every authored object on this
 * island is a single merged mesh, so a generated form that decomposes into
 * meaningful parts has a large delta and no deficit at all — and gating the
 * delta would pay a generator to merge its parts away.
 */
const RECORDED = Object.freeze({
  worstComponentDeficit: 0,
  meanComponentDeficit: 0,
  entitiesMissingComponents: 0,
});

function partsOf(kind, seed) {
  const object = generateSceneObject(kind, seed);
  object.updateMatrixWorld(true);
  const parts = [];
  object.traverse((child) => {
    if (!child.isMesh) return;
    const bounds = new THREE.Box3().setFromObject(child);
    parts.push({
      id: child.userData.semanticPart,
      centre: bounds.getCenter(new THREE.Vector3()),
      size: bounds.getSize(new THREE.Vector3()),
    });
  });
  return parts;
}

test("a multi-part authored object gets parts, with identities that hold still", () => {
  // The authored panda rig is fifteen meshes and the generator used to emit six
  // or seven, one of which existed only when a coin flip said so. A part that
  // exists half the time is not a part the evaluation can hold anyone to.
  const first = partsOf("panda", 4242);
  assert.equal(first.length, 15, `panda emits ${first.length} parts, not 15`);
  assert.equal(new Set(first.map((row) => row.id)).size, 15, "part ids are not distinct");

  for (const seed of [1, 991, 20260730]) {
    const parts = partsOf("panda", seed);
    assert.deepEqual(
      parts.map((row) => row.id),
      first.map((row) => row.id),
      `panda part identities changed at seed ${seed}`,
    );
    parts.forEach((row, index) => {
      assert.deepEqual(
        row.centre.toArray().map((value) => +value.toFixed(6)),
        first[index].centre.toArray().map((value) => +value.toFixed(6)),
        `panda part ${row.id} moved at seed ${seed}`,
      );
    });
  }
});

test("the parts are a body chain and four legs, not fifteen anonymous blobs", () => {
  const parts = partsOf("panda", 7);
  const byId = new Map(parts.map((row) => [row.id, row]));

  // Ticket 10 asks for meaningful structure. A named chain and named limbs are
  // the difference between semantic parts and a part count.
  const chain = ["head", "chest", "hips"];
  for (const id of chain) assert.ok(byId.has(id), `the body chain is missing ${id}`);
  const legs = parts.filter((row) => /^(front|rear)-(left|right)-/.test(row.id));
  assert.equal(legs.length, 12, `expected twelve leg segments, saw ${legs.length}`);
  assert.equal(
    new Set(legs.map((row) => row.id.replace(/-(left|right)-/, "-"))).size,
    6,
    "the two sides do not carry the same segments",
  );

  // The authored rigs face their own local -Z with the head mass at the front of
  // the chain. Reversing that satisfies the extent contract exactly and puts
  // every panda's head where its tail is, so it is worth a test.
  assert.ok(
    byId.get("head").centre.z < byId.get("chest").centre.z,
    "the head is behind the chest",
  );
  assert.ok(
    byId.get("chest").centre.z < byId.get("hips").centre.z,
    "the chest is behind the hips",
  );
  assert.equal(
    authoredParts.topology.facing.join(","),
    "-1",
    "the authored facing measurement no longer says -Z",
  );

  // Legs come in mirrored pairs across the long axis, and the chain sits on it.
  for (const leg of ["front", "rear"]) {
    for (const segment of new Set(
      legs
        .filter((row) => row.id.startsWith(`${leg}-`))
        .map((row) => row.id.split("-").at(-1)),
    )) {
      const left = byId.get(`${leg}-left-${segment}`);
      const right = byId.get(`${leg}-right-${segment}`);
      assert.ok(left.centre.x < 0 && right.centre.x > 0, `${leg} ${segment} is not mirrored`);
      assert.ok(
        Math.abs(left.centre.x + right.centre.x) < 1e-6,
        `${leg} ${segment} sits off the long axis`,
      );
      assert.ok(
        Math.abs(left.centre.z - right.centre.z) < 1e-6,
        `${leg} ${segment} pair is skewed along the body`,
      );
    }
  }
  for (const id of chain) {
    assert.ok(Math.abs(byId.get(id).centre.x) < 1e-6, `${id} is off the long axis`);
  }
});

test("the authored part structure the program was fitted to still measures the same", () => {
  // If the reference ever reports a different topology, the program is fitted to
  // something that is no longer there.
  assert.deepEqual(authoredParts.topology.partCounts, [15]);
  assert.equal(authoredParts.topology.rigs, 14);
  assert.ok(
    authoredParts.assets.length >= 2,
    "the proportions were fitted to fewer than two distinct assets",
  );
  for (const asset of authoredParts.assets) {
    assert.equal(asset.masses.length, 3, "an authored rig is not a three-mass chain");
    assert.equal(asset.legs.length, 2, "an authored rig is not a four-legged pair of pairs");
    for (const leg of asset.legs) assert.equal(leg.segments.length, 3);
  }
});

test("no entity is missing semantic parts", () => {
  const structure = correspondence.semanticStructure;

  assert.ok(structure.componentDeficit, "the deficit metric must exist");
  assert.ok(
    structure.componentDeficit.max <= RECORDED.worstComponentDeficit,
    `worst component deficit ${structure.componentDeficit.max} regressed past ${RECORDED.worstComponentDeficit}`,
  );
  assert.ok(
    structure.componentDeficit.mean <= RECORDED.meanComponentDeficit,
    `mean component deficit ${structure.componentDeficit.mean} regressed`,
  );
  assert.equal(
    structure.entitiesMissingComponents,
    RECORDED.entitiesMissingComponents,
    `${structure.entitiesMissingComponents} entities are missing parts`,
  );
  // Extra parts are not a deficit; the two metrics must be able to disagree.
  assert.ok(structure.componentDelta.max >= structure.componentDeficit.max);
});
