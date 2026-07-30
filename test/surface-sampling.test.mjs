import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  SAMPLE_CAP,
  SAMPLE_FLOOR,
  allocateSamples,
  sampleBudget,
  sampleEntitySurface,
  triangleCountOf,
} from "../tools/evaluation/surface-sampling.mjs";

/**
 * Analytical fixtures for the surface sampler's allocation.
 *
 * Scene Surface Parity compares two point sets, so how those points are distributed
 * over each subject decides what the metric can see. The allocation was per mesh and
 * the formula is sub-linear and floored, which made the metric depend on how a form is
 * divided into parts — and it penalised exactly the semantic part structure the
 * milestone requires a generator to have.
 *
 * Measured before the fix: a generated bamboo clump splitting culms from foliage gave
 * its culms 28 per cent of the samples for 13 per cent of the triangles, while the
 * authored placement is one mesh whose culms are three parts in a thousand and were
 * never sampled. Reference-to-candidate p95 read 4.12 and candidate-to-reference 39.32
 * — the canopy already covered the authored one and the whole penalty came from how
 * the candidate was divided.
 */

function meshOf(triangles, { x = 0 } = {}) {
  // A strip of `triangles` triangles, so triangle count is exact and the geometry is
  // somewhere findable in space.
  const positions = [];
  for (let index = 0; index < triangles; index += 1) {
    positions.push(x + index, 0, 0, x + index + 1, 0, 0, x + index, 1, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  return new THREE.Mesh(geometry);
}

function entityOf(triangleCounts) {
  const root = new THREE.Group();
  triangleCounts.forEach((count, index) => root.add(meshOf(count, { x: index * 1000 })));
  return root;
}

test("the budget comes from an entity's total triangles, not from each mesh", () => {
  assert.equal(sampleBudget(0), 0);
  assert.equal(sampleBudget(1), SAMPLE_FLOOR);
  assert.equal(sampleBudget(1_000_000), SAMPLE_CAP);
  // Splitting a body in two may not change how many points describe it.
  const whole = sampleBudget(720);
  const halves = sampleBudget(360) + sampleBudget(360);
  assert.ok(
    halves > whole,
    "this fixture is pointless unless the per-mesh formula over-samples a split body",
  );
  assert.equal(sampleEntitySurface(entityOf([720])).length / 3, whole);
  assert.equal(sampleEntitySurface(entityOf([360, 360])).length / 3, whole);
  assert.equal(sampleEntitySurface(entityOf([180, 180, 180, 180])).length / 3, whole);
});

test("a mesh's share of the samples is its share of the triangles", () => {
  // The measured case: a bamboo clump's culms are 96 of 720 triangles, and used to
  // draw 28 per cent of its samples.
  const allocation = allocateSamples([96, 624], sampleBudget(720));
  const share = allocation[0] / (allocation[0] + allocation[1]);
  const triangleShare = 96 / 720;
  assert.ok(
    Math.abs(share - triangleShare) < 0.03,
    `culms drew ${(share * 100).toFixed(1)} per cent of the samples for ${(triangleShare * 100).toFixed(1)} per cent of the triangles`,
  );
  // The total is exact: rounding goes somewhere rather than being dropped.
  assert.equal(allocation[0] + allocation[1], sampleBudget(720));
});

test("a part that exists is represented, and one that does not is not", () => {
  // A thin part still gets a point — a form's parts should all appear — but one
  // sample out of eighty cannot reproduce the old bias.
  const allocation = allocateSamples([2, 5000], sampleBudget(5002));
  assert.ok(allocation[0] >= 1, "a part with triangles was allocated nothing");
  assert.ok(allocation[0] <= 3, `a two-triangle part drew ${allocation[0]} samples`);
  assert.deepEqual(allocateSamples([0, 0], 96), [0, 0]);
  assert.deepEqual(allocateSamples([100, 0, 300], 96), [24, 0, 72]);
  assert.deepEqual(allocateSamples([10, 10], 0), [0, 0]);
});

test("a single-mesh entity is sampled exactly as it was before", () => {
  // The reference's authored placements are overwhelmingly one mesh each, so the fix
  // must leave them untouched or every frozen number moves for no reason.
  for (const triangles of [1, 12, 96, 720, 19_908]) {
    const root = entityOf([triangles]);
    assert.equal(
      sampleEntitySurface(root).length / 3,
      Math.min(SAMPLE_CAP, Math.max(SAMPLE_FLOOR, Math.round(Math.sqrt(triangles) * 3))),
      `a single mesh of ${triangles} triangles changed its sample count`,
    );
  }
});

test("sampling is deterministic and independent of the rest of the scene", () => {
  const first = sampleEntitySurface(entityOf([200, 500]));
  const second = sampleEntitySurface(entityOf([200, 500]));
  assert.deepEqual(first, second);
  // Each mesh is seeded by its index within its own entity, so an entity's samples do
  // not depend on where it sits in the walk.
  const nested = new THREE.Group();
  nested.add(entityOf([200, 500]));
  assert.deepEqual(sampleEntitySurface(nested), first);
});

test("triangleCountOf reads indexed and non-indexed geometry alike", () => {
  const plain = meshOf(7);
  assert.equal(triangleCountOf(plain.geometry), 7);
  const indexed = plain.geometry.clone();
  indexed.setIndex([...Array(21).keys()]);
  assert.equal(triangleCountOf(indexed), 7);
  assert.equal(triangleCountOf(new THREE.BufferGeometry()), 0);
  assert.equal(triangleCountOf(undefined), 0);
});
