import { NodeIO } from "@gltf-transform/core";
import { KHRDracoMeshCompression } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import * as THREE from "three";

import {
  canonicalSupportDirections,
  STONE_SUPPORT_DIRECTION_COUNT,
} from "../../gt_designer/src/reconstruction/objects/stone-generator.js";
import { STONE_RECIPE } from "../../gt_designer/src/reconstruction/objects/stone-recipe.js";

const SOURCE_NODE = "Stone__stone_8__0.003";
const args = new Set(process.argv.slice(2));
if ([...args].some((argument) => argument !== "--check")) {
  throw new Error("usage: node tools/development/fit-stone-supports.mjs [--check]");
}

async function sourceGeometry() {
  const io = new NodeIO()
    .registerExtensions([KHRDracoMeshCompression])
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
    });
  const document = await io.read("gt_designer/data/island-village.glb");
  const node = document.getRoot().listNodes().find(
    (candidate) => candidate.getName() === SOURCE_NODE,
  );
  const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
  const point = new THREE.Vector3();
  const positions = [];
  const indices = [];
  for (const primitive of node.getMesh().listPrimitives()) {
    const source = primitive.getAttribute("POSITION").getArray();
    const offset = positions.length;
    for (let index = 0; index < source.length; index += 3) {
      positions.push(
        point
          .set(source[index], source[index + 1], source[index + 2])
          .applyMatrix4(matrix)
          .clone(),
      );
    }
    for (const index of primitive.getIndices().getArray()) {
      indices.push(offset + index);
    }
  }
  const bounds = new THREE.Box3().setFromPoints(positions);
  const origin = new THREE.Vector3(
    (bounds.min.x + bounds.max.x) * 0.5,
    bounds.min.y,
    (bounds.min.z + bounds.max.z) * 0.5,
  );
  positions.forEach((entry) => entry.sub(origin));
  return { positions, indices };
}

function planeIntersection(first, second, third) {
  const cross = new THREE.Vector3().crossVectors(second.normal, third.normal);
  const denominator = first.normal.dot(cross);
  if (Math.abs(denominator) < 1e-9) return null;
  return cross
    .multiplyScalar(first.distance)
    .add(
      new THREE.Vector3()
        .crossVectors(third.normal, first.normal)
        .multiplyScalar(second.distance),
    )
    .add(
      new THREE.Vector3()
        .crossVectors(first.normal, second.normal)
        .multiplyScalar(third.distance),
    )
    .multiplyScalar(1 / denominator);
}

function buildPolyhedron(directions, distances) {
  const planes = directions.map((normal, index) => ({
    normal,
    distance: distances[index],
  }));
  const positions = [];
  for (let first = 0; first < planes.length - 2; first += 1) {
    for (let second = first + 1; second < planes.length - 1; second += 1) {
      for (let third = second + 1; third < planes.length; third += 1) {
        const point = planeIntersection(
          planes[first],
          planes[second],
          planes[third],
        );
        if (!point) continue;
        if (planes.some(
          (plane) => plane.normal.dot(point) > plane.distance + 1e-7,
        )) continue;
        if (positions.some(
          (entry) => entry.distanceToSquared(point) < 1e-10,
        )) continue;
        positions.push(point);
      }
    }
  }
  const indices = [];
  for (const plane of planes) {
    const face = positions
      .map((point, index) => ({ point, index }))
      .filter(({ point }) =>
        Math.abs(plane.normal.dot(point) - plane.distance) < 1e-5
      );
    if (face.length < 3) continue;
    const center = face
      .reduce((sum, entry) => sum.add(entry.point), new THREE.Vector3())
      .multiplyScalar(1 / face.length);
    const guide = Math.abs(plane.normal.y) > 0.5
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3()
      .crossVectors(guide, plane.normal)
      .normalize();
    const bitangent = new THREE.Vector3()
      .crossVectors(plane.normal, tangent);
    face.sort((left, right) => {
      const a = left.point.clone().sub(center);
      const b = right.point.clone().sub(center);
      return Math.atan2(a.dot(bitangent), a.dot(tangent)) -
        Math.atan2(b.dot(bitangent), b.dot(tangent));
    });
    for (let index = 1; index < face.length - 1; index += 1) {
      indices.push(face[0].index, face[index].index, face[index + 1].index);
    }
  }
  return { positions, indices };
}

function trianglesOf(geometry) {
  const triangles = [];
  for (let index = 0; index < geometry.indices.length; index += 3) {
    triangles.push(new THREE.Triangle(
      geometry.positions[geometry.indices[index]],
      geometry.positions[geometry.indices[index + 1]],
      geometry.positions[geometry.indices[index + 2]],
    ));
  }
  return triangles;
}

function samplesOf(geometry, triangles) {
  const samples = [...geometry.positions];
  for (const triangle of triangles) {
    samples.push(
      triangle.a.clone().add(triangle.b).add(triangle.c).multiplyScalar(1 / 3),
    );
  }
  return samples;
}

function distancesToMesh(samples, triangles) {
  const closest = new THREE.Vector3();
  return samples.map((sample) => {
    let minimum = Infinity;
    for (const triangle of triangles) {
      triangle.closestPointToPoint(sample, closest);
      minimum = Math.min(minimum, closest.distanceToSquared(sample));
    }
    return Math.sqrt(minimum);
  });
}

function volumeOf(geometry) {
  let volume = 0;
  for (let index = 0; index < geometry.indices.length; index += 3) {
    const first = geometry.positions[geometry.indices[index]];
    const second = geometry.positions[geometry.indices[index + 1]];
    const third = geometry.positions[geometry.indices[index + 2]];
    volume += first.dot(new THREE.Vector3().crossVectors(second, third)) / 6;
  }
  return Math.abs(volume);
}

function quantile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

const source = await sourceGeometry();
const sourceTriangles = trianglesOf(source);
const sourceSamples = samplesOf(source, sourceTriangles);
const sourceVolume = volumeOf(source);
const sourceBounds = new THREE.Box3().setFromPoints(source.positions);
const directions = canonicalSupportDirections();
if (directions.length !== STONE_SUPPORT_DIRECTION_COUNT) {
  throw new Error("production Stone support-direction contract is incomplete");
}
const distances = directions.map((normal) =>
  Math.max(...source.positions.map((point) => point.dot(normal)))
);

function evaluate(candidateDistances) {
  const candidate = buildPolyhedron(directions, candidateDistances);
  if (candidate.positions.length < 4 || candidate.indices.length < 12) {
    return { score: Infinity };
  }
  const candidateTriangles = trianglesOf(candidate);
  const candidateSamples = samplesOf(candidate, candidateTriangles);
  const surfaceDistances = [
    ...distancesToMesh(sourceSamples, candidateTriangles),
    ...distancesToMesh(candidateSamples, sourceTriangles),
  ];
  const mean = surfaceDistances.reduce((sum, value) => sum + value, 0) /
    surfaceDistances.length;
  const p95 = quantile(surfaceDistances, 0.95);
  const volumeError = Math.abs(volumeOf(candidate) / sourceVolume - 1);
  const candidateBounds = new THREE.Box3().setFromPoints(candidate.positions);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const candidateSize = candidateBounds.getSize(new THREE.Vector3());
  const boundsError = Math.max(
    ...sourceSize.toArray().map(
      (value, index) => Math.abs(candidateSize.getComponent(index) / value - 1),
    ),
  );
  const bottomError = Math.abs(candidateBounds.min.y - sourceBounds.min.y) /
    Math.max(...sourceSize.toArray());
  return {
    score:
      mean + p95 * 0.5 + volumeError * 2 +
      Math.max(0, boundsError - 0.015) * 10 + bottomError * 10,
    mean,
    p95,
    volumeError,
    boundsError,
    bottomError,
    vertices: candidate.positions.length,
    triangles: candidate.indices.length / 3,
  };
}

let best = evaluate(distances);
process.stdout.write(`initial ${JSON.stringify(best)}\n`);
for (const step of [0.5, 0.25, 0.1, 0.05, 0.02, 0.01]) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 6; index < distances.length; index += 1) {
      const original = distances[index];
      let accepted = false;
      for (const direction of [-1, 1]) {
        distances[index] = original + step * direction;
        const result = evaluate(distances);
        if (result.score < best.score) {
          best = result;
          changed = true;
          accepted = true;
          break;
        }
      }
      if (!accepted) distances[index] = original;
    }
  }
  process.stdout.write(`step ${step} ${JSON.stringify(best)}\n`);
}
const fittedDistances = distances.map((value) => Number(value.toFixed(6)));
process.stdout.write(
  `${fittedDistances.map((value) => value.toFixed(6)).join(",\n")}\n`,
);
if (args.has("--check")) {
  const frozenDistances = [...STONE_RECIPE.shape.supportDistances];
  if (JSON.stringify(fittedDistances) !== JSON.stringify(frozenDistances)) {
    throw new Error(
      `frozen Stone recipe does not match the production-direction refit:\n${JSON.stringify({ fittedDistances, frozenDistances }, null, 2)}`,
    );
  }
  process.stdout.write(
    `stone support fit: PASS (${STONE_SUPPORT_DIRECTION_COUNT} distances reproduced)\n`,
  );
}
