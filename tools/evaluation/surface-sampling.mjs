import * as THREE from "three";

/**
 * Bounded deterministic world-space surface sampling.
 *
 * Development-only: no sample array reaches the Scene Recipe or the Production
 * Runtime.
 *
 * The budget belongs to the *entity*, not to each of its meshes, and this is the
 * whole point of the module rather than a detail of it.
 *
 * Allocating per mesh made the metric depend on how a form is divided into parts.
 * The formula is sub-linear and floored, so a small part is sampled far more
 * densely than its share of the geometry: a generated bamboo clump splitting culms
 * from foliage gave its culms 28 per cent of the samples for 13 per cent of the
 * triangles, while the authored placement is one mesh whose culms are three parts in
 * a thousand and are therefore never sampled at all. Measured across every kind,
 * bamboo read 4.12 reference-to-candidate against 39.32 the other way while palm
 * read 0.73 and blossom 1.18 — the candidate's canopy already covered the authored
 * one and the entire penalty was one-directional.
 *
 * That penalised the semantic part structure the milestone requires a generator to
 * have. So the entity's budget comes from its *total* triangle count, and a
 * multi-part entity is sampled exactly as its own merged equivalent would be, which
 * is what makes the two subjects comparable at all.
 *
 * The same argument runs one level finer, and that is the rest of the module. A
 * triangle is a division too. Picking one with uniform probability makes a point's
 * chance of landing somewhere proportional to the *triangle density* there rather
 * than to the surface, so the metric reads how each subject happens to be
 * tessellated — and an Exact-ish Reconstruction is explicitly not required to
 * reproduce source topology. Measured on the authored scene, three of the eight
 * structural-tree placements hold 20 to 36 per cent of their area in the bottom three
 * height deciles and drew one sample of ninety-six there, wrong by up to thirty-five
 * fold; across the whole candidate the total-variation distance between the two
 * distributions averages 0.366. Both the pick inside a mesh and the split across an
 * entity's meshes therefore follow **world-space area**, which keeps the merge
 * invariance above — splitting a body in two splits its area in two — while removing
 * the tessellation bias. See ADR-0061.
 */

export const SAMPLE_CAP = 96;
export const SAMPLE_FLOOR = 12;

/** How many triangles a geometry actually draws. */
export function triangleCountOf(geometry) {
  const position = geometry?.attributes?.position;
  if (!position) return 0;
  const index = geometry.index;
  return Math.floor((index ? index.count : position.count) / 3);
}

/**
 * The sample budget for a body of geometry, from its total triangle count.
 *
 * Applied to an entity's total rather than to one mesh, so splitting a form into
 * parts cannot change how many points describe it.
 */
export function sampleBudget(triangleCount) {
  if (triangleCount <= 0) return 0;
  return Math.min(SAMPLE_CAP, Math.max(SAMPLE_FLOOR, Math.round(Math.sqrt(triangleCount) * 3)));
}

/**
 * World-space triangle areas of one mesh, in draw order.
 *
 * World space rather than local: a mesh may carry a non-uniform scale, and the points
 * this weights are compared in the shared world frame.
 */
export function triangleAreas(mesh) {
  const geometry = mesh?.geometry;
  const position = geometry?.attributes?.position;
  if (!position) return [];
  const index = geometry.index;
  const count = Math.floor((index ? index.count : position.count) / 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const areas = new Array(count);
  for (let triangle = 0; triangle < count; triangle += 1) {
    const base = triangle * 3;
    const i0 = index ? index.getX(base) : base;
    const i1 = index ? index.getX(base + 1) : base + 1;
    const i2 = index ? index.getX(base + 2) : base + 2;
    a.fromBufferAttribute(position, i0).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(position, i1).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(position, i2).applyMatrix4(mesh.matrixWorld);
    areas[triangle] = b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return areas;
}

/** One mesh's world-space surface area. */
export function surfaceAreaOf(mesh) {
  return triangleAreas(mesh).reduce((sum, area) => sum + area, 0);
}

/**
 * Splits an entity's budget across its meshes in proportion to their **area**,
 * distributing the rounding remainder to the largest parts so the total is exact.
 *
 * A mesh with area always gets at least one sample: a part that exists should
 * be represented, and one point out of ninety-six cannot reproduce the old bias.
 */
export function allocateSamples(weights, budget) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0 || budget <= 0) return weights.map(() => 0);
  const exact = weights.map((weight) => (weight > 0 ? (weight / total) * budget : 0));
  const allocated = exact.map((value, index) =>
    weights[index] > 0 ? Math.max(1, Math.floor(value)) : 0,
  );
  let remainder = budget - allocated.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction);
  for (let step = 0; remainder > 0 && order.length > 0; step += 1) {
    const { index } = order[step % order.length];
    if (weights[index] === 0) continue;
    allocated[index] += 1;
    remainder -= 1;
  }
  return allocated;
}

export function sampleRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

/**
 * Samples one mesh. `count` is the share of its entity's budget this mesh was
 * allocated; omitted, the mesh is its own entity and takes the whole budget, which is
 * what a single-mesh subject has always got.
 */
export function sampleMeshSurface(mesh, seed, count) {
  const geometry = mesh.geometry;
  const position = geometry?.attributes?.position;
  if (!position) return [];
  const index = geometry.index;
  const triangleCount = Math.floor((index ? index.count : position.count) / 3);
  if (triangleCount === 0) return [];

  const total = count === undefined ? sampleBudget(triangleCount) : count;
  if (total <= 0) return [];
  const rng = sampleRng(seed);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const point = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const samples = [];

  /**
   * A cumulative area table, so a triangle is drawn in proportion to how much surface
   * it actually is. Uniform-per-triangle made a point's chance of landing somewhere
   * proportional to the tessellation density there; a subject is not required to
   * reproduce the other's topology, so that measured the wrong thing.
   *
   * A degenerate mesh — every triangle zero-area — falls back to uniform, because it
   * has no surface to weight by and returning nothing would hide a part that exists.
   */
  const areas = triangleAreas(mesh);
  const cumulative = new Float64Array(triangleCount);
  let running = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    running += areas[triangle];
    cumulative[triangle] = running;
  }
  const totalArea = running;
  const pickTriangle = (value) => {
    if (!(totalArea > 0)) return Math.min(triangleCount - 1, Math.floor(value * triangleCount));
    const target = value * totalArea;
    let low = 0;
    let high = triangleCount - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (cumulative[middle] < target) low = middle + 1;
      else high = middle;
    }
    return low;
  };

  for (let sample = 0; sample < total; sample += 1) {
    const triangle = pickTriangle(rng());
    const base = triangle * 3;
    const i0 = index ? index.getX(base) : base;
    const i1 = index ? index.getX(base + 1) : base + 1;
    const i2 = index ? index.getX(base + 2) : base + 2;
    a.fromBufferAttribute(position, i0);
    b.fromBufferAttribute(position, i1);
    c.fromBufferAttribute(position, i2);
    let u = rng();
    let v = rng();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    point.copy(a).addScaledVector(b.sub(a), u).addScaledVector(c.sub(a), v);
    if (mesh.isInstancedMesh) {
      mesh.getMatrixAt(Math.min(mesh.count - 1, Math.floor(rng() * mesh.count)), matrix);
      point.applyMatrix4(matrix);
    }
    point.applyMatrix4(mesh.matrixWorld);
    samples.push(
      Number(point.x.toFixed(2)),
      Number(point.y.toFixed(2)),
      Number(point.z.toFixed(2)),
    );
  }
  return samples;
}

/**
 * Samples one placed entity: one budget from its total triangles, split across its
 * meshes in proportion.
 *
 * Each mesh keeps its seed from its index within the entity, so a form's samples are
 * unchanged by anything outside it and a single-mesh entity is byte-identical to what
 * the per-mesh rule produced.
 */
export function sampleEntitySurface(root) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });
  // The budget is a cost ceiling and stays on triangle count; the *split* is by area,
  // so a finely-tessellated part draws its share of the surface rather than its share
  // of the divisions.
  const triangleCounts = meshes.map((mesh) => triangleCountOf(mesh.geometry));
  const budget = sampleBudget(triangleCounts.reduce((sum, count) => sum + count, 0));
  const allocation = allocateSamples(meshes.map(surfaceAreaOf), budget);
  const samples = [];
  meshes.forEach((mesh, index) => {
    samples.push(...sampleMeshSurface(mesh, index + 1, allocation[index]));
  });
  return samples;
}

/**
 * Symmetric point-set distance. Both directions are reported separately so a
 * candidate that covers the reference but adds bulk elsewhere cannot hide
 * behind a one-way average.
 */
export function surfaceDistance(left, right, tolerance) {
  if (left.length === 0 || right.length === 0) return null;
  const forward = nearestDistances(left, right);
  const backward = nearestDistances(right, left);
  const all = [...forward, ...backward];
  return {
    referenceToCandidate: summarize(forward, tolerance),
    candidateToReference: summarize(backward, tolerance),
    symmetric: summarize(all, tolerance),
  };
}

function nearestDistances(from, to) {
  const distances = new Array(from.length / 3);
  for (let index = 0; index < from.length; index += 3) {
    const x = from[index];
    const y = from[index + 1];
    const z = from[index + 2];
    let best = Infinity;
    for (let other = 0; other < to.length; other += 3) {
      const dx = x - to[other];
      const dy = y - to[other + 1];
      const dz = z - to[other + 2];
      const squared = dx * dx + dy * dy + dz * dz;
      if (squared < best) best = squared;
    }
    distances[index / 3] = Math.sqrt(best);
  }
  return distances;
}

function summarize(distances, tolerance) {
  const sorted = [...distances].sort((a, b) => a - b);
  const rmse = Math.sqrt(
    distances.reduce((sum, value) => sum + value * value, 0) / distances.length,
  );
  const percentile = (fraction) =>
    sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
  return {
    count: distances.length,
    rmse: Number(rmse.toFixed(4)),
    mean: Number(
      (distances.reduce((sum, value) => sum + value, 0) / distances.length).toFixed(4),
    ),
    p50: Number(percentile(0.5).toFixed(4)),
    p95: Number(percentile(0.95).toFixed(4)),
    max: Number(sorted.at(-1).toFixed(4)),
    overToleranceFraction: Number(
      (distances.filter((value) => value > tolerance).length / distances.length).toFixed(4),
    ),
  };
}
