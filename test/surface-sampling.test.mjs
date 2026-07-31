import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  SAMPLE_CAP,
  SAMPLE_FLOOR,
  allocateSamples,
  sampleBudget,
  sampleEntitySurface,
  surfaceAreaOf,
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

function meshOf(triangles, { x = 0, scale = 1 } = {}) {
  // A strip of `triangles` triangles, so triangle count is exact and the geometry is
  // somewhere findable in space. `scale` sets each triangle's leg length, so a strip's
  // total area is `triangles * scale * scale / 2` independently of its count.
  const positions = [];
  for (let index = 0; index < triangles; index += 1) {
    const left = x + index * scale;
    positions.push(left, 0, 0, left + scale, 0, 0, left, scale, 0);
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

/** How many of an entity's sampled points landed beyond `x`. */
function pointsBeyond(samples, x) {
  let count = 0;
  for (let index = 0; index < samples.length; index += 3) {
    if (samples[index] >= x) count += 1;
  }
  return count;
}

/**
 * One mesh whose triangles are deliberately unequal in area: `groups` is a list of
 * `{ triangles, scale, x }`, so a caller can put most of a surface into a few large
 * faces and most of its *triangles* into a distant cloud of small ones.
 */
function unevenMeshOf(groups) {
  const positions = [];
  for (const { triangles, scale, x } of groups) {
    for (let index = 0; index < triangles; index += 1) {
      const left = x + index * scale;
      positions.push(left, 0, 0, left + scale, 0, 0, left, scale, 0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  return new THREE.Mesh(geometry);
}

test("sample density follows surface area, not tessellation", () => {
  /**
   * The defect this fixture exists for. Picking a triangle with uniform probability
   * makes a point's chance of landing somewhere proportional to the *triangle density*
   * there rather than to the area, so the metric measures how a subject is tessellated.
   * That is the same failure ADR-0055 fixed one level up: the sampler must not depend on
   * how a form is divided, and a triangle is a division.
   *
   * Measured on the authored scene before the fix, three of the eight structural-tree
   * placements put 20 to 36 per cent of their *area* in the bottom three height deciles
   * and drew 1 of 96 samples there — wrong by up to thirty-five fold, which is far
   * outside anything ninety-six samples could produce by chance.
   */
  const mesh = unevenMeshOf([
    // Nearly all of the area, in four large faces.
    { triangles: 4, scale: 10, x: 0 },
    // Nearly all of the triangles, in a distant cloud carrying 0.25 per cent of it.
    { triangles: 396, scale: 0.05, x: 1000 },
  ]);
  const root = new THREE.Group();
  root.add(mesh);
  const samples = sampleEntitySurface(root);
  const total = samples.length / 3;
  assert.equal(total, sampleBudget(400));
  const cloudArea = (396 * 0.05 * 0.05) / 2;
  const cloudShare = cloudArea / (cloudArea + (4 * 10 * 10) / 2);
  assert.ok(cloudShare < 0.005, "this fixture is pointless unless the cloud is tiny in area");
  const inCloud = pointsBeyond(samples, 1000);
  assert.ok(
    inCloud <= 3,
    `the small-triangle cloud is ${(cloudShare * 100).toFixed(2)} per cent of the area and drew ` +
      `${inCloud} of ${total} samples — the sampler is following tessellation, not surface`,
  );
});

test("surfaceAreaOf measures world-space area", () => {
  const mesh = meshOf(2, { scale: 3 });
  assert.equal(Math.round(surfaceAreaOf(mesh)), 9);
  mesh.scale.set(2, 2, 2);
  mesh.updateMatrixWorld(true);
  assert.equal(Math.round(surfaceAreaOf(mesh)), 36);
  assert.equal(surfaceAreaOf(new THREE.Mesh(new THREE.BufferGeometry())), 0);
});

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

test("a mesh's share of the samples is its share of the area", () => {
  // Allocation is by area for the same reason the pick inside a mesh is: splitting a
  // body in two splits its area in two, so area keeps ADR-0055's merge invariance
  // *and* stops a finely-tessellated part drawing more than it covers.
  const allocation = allocateSamples([48, 312], sampleBudget(720));
  const share = allocation[0] / (allocation[0] + allocation[1]);
  const areaShare = 48 / 360;
  assert.ok(
    Math.abs(share - areaShare) < 0.03,
    `a part drew ${(share * 100).toFixed(1)} per cent of the samples for ${(areaShare * 100).toFixed(1)} per cent of the area`,
  );
  // The total is exact: rounding goes somewhere rather than being dropped.
  assert.equal(allocation[0] + allocation[1], sampleBudget(720));
});

test("splitting a mesh does not change how an entity is sampled", () => {
  // The invariant ADR-0055 was written for, restated on area. A mesh and its own two
  // halves must draw the same points in the same places, so a generator is never
  // penalised or rewarded for where it puts a part boundary.
  const whole = sampleEntitySurface(entityOf([720]));
  const budget = sampleBudget(720);
  assert.deepEqual(allocateSamples([180, 180], budget), [budget / 2, budget / 2]);
  assert.equal(whole.length / 3, budget);
  assert.equal(sampleEntitySurface(entityOf([360, 360])).length / 3, budget);
});

test("a part that exists is represented, and one that does not is not", () => {
  // A thin part still gets a point — a form's parts should all appear — but one
  // sample out of eighty cannot reproduce the old bias.
  const allocation = allocateSamples([1, 2500], sampleBudget(5002));
  assert.ok(allocation[0] >= 1, "a part with area was allocated nothing");
  assert.ok(allocation[0] <= 3, `a sliver part drew ${allocation[0]} samples`);
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
