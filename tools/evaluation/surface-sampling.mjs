import * as THREE from "three";

/**
 * Bounded deterministic world-space surface sampling.
 *
 * The same fixed per-mesh cap the reference measurement uses, so reference and
 * candidate sample densities are comparable and neither depends on source mesh
 * resolution. Development-only: no sample array reaches the Scene Recipe or the
 * Production Runtime.
 */

export const SAMPLE_CAP = 96;
export const SAMPLE_FLOOR = 12;

export function sampleRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

export function sampleMeshSurface(mesh, seed) {
  const geometry = mesh.geometry;
  const position = geometry?.attributes?.position;
  if (!position) return [];
  const index = geometry.index;
  const triangleCount = Math.floor((index ? index.count : position.count) / 3);
  if (triangleCount === 0) return [];

  const count = Math.min(
    SAMPLE_CAP,
    Math.max(SAMPLE_FLOOR, Math.round(Math.sqrt(triangleCount) * 3)),
  );
  const rng = sampleRng(seed);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const point = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const samples = [];

  for (let sample = 0; sample < count; sample += 1) {
    const triangle = Math.min(triangleCount - 1, Math.floor(rng() * triangleCount));
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

/** Samples one placed entity, seeding each mesh from its index within the entity. */
export function sampleEntitySurface(root) {
  root.updateMatrixWorld(true);
  const samples = [];
  let index = 0;
  root.traverse((child) => {
    if (!child.isMesh) return;
    index += 1;
    samples.push(...sampleMeshSurface(child, index));
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
