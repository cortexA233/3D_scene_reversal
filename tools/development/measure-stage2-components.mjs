import { NodeIO } from "@gltf-transform/core";
import { KHRDracoMeshCompression } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { LAB_SCENE } from "../../gt_designer/single-mesh-lab/scene-config.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const OBJECT_IDS = new Set(["bamboo-shoot", "mushroom", "blue-hat", "candle"]);
const INPUT = path.join(PROJECT_ROOT, "gt_designer/data/island-village.glb");
const OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-lab/ground-truth/stage2-component-measurements-v1.json",
);

function geometryOf(node) {
  const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
  const positions = [];
  const indices = [];
  const point = new THREE.Vector3();
  for (const primitive of node.getMesh().listPrimitives()) {
    const source = primitive.getAttribute("POSITION").getArray();
    const offset = positions.length / 3;
    for (let index = 0; index < source.length; index += 3) {
      point.set(source[index], source[index + 1], source[index + 2]).applyMatrix4(matrix);
      positions.push(point.x, point.y, point.z);
    }
    const sourceIndices = primitive.getIndices()?.getArray() ??
      Array.from({ length: source.length / 3 }, (_, index) => index);
    for (const index of sourceIndices) indices.push(offset + index);
  }
  return { positions, indices };
}

function componentMeasurements({ positions, indices }) {
  const bounds = new THREE.Box3();
  for (let index = 0; index < positions.length; index += 3) {
    bounds.expandByPoint(
      new THREE.Vector3(positions[index], positions[index + 1], positions[index + 2]),
    );
  }
  const size = bounds.getSize(new THREE.Vector3());
  const tolerance = Math.max(size.x, size.y, size.z) * 1e-6;
  const bottomCenter = new THREE.Vector3(
    (bounds.min.x + bounds.max.x) * 0.5,
    bounds.min.y,
    (bounds.min.z + bounds.max.z) * 0.5,
  );
  const weldedByKey = new Map();
  const welded = new Uint32Array(positions.length / 3);
  let weldedCount = 0;
  for (let index = 0; index < welded.length; index += 1) {
    const key = [
      positions[index * 3],
      positions[index * 3 + 1],
      positions[index * 3 + 2],
    ].map((value) => Math.round(value / tolerance)).join(":");
    if (!weldedByKey.has(key)) weldedByKey.set(key, weldedCount++);
    welded[index] = weldedByKey.get(key);
  }
  const parent = Array.from({ length: weldedCount }, (_, index) => index);
  const find = (value) => {
    while (parent[value] !== value) {
      parent[value] = parent[parent[value]];
      value = parent[value];
    }
    return value;
  };
  const union = (left, right) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[b] = a;
  };
  for (let index = 0; index < indices.length; index += 3) {
    union(welded[indices[index]], welded[indices[index + 1]]);
    union(welded[indices[index + 1]], welded[indices[index + 2]]);
  }
  const facesByRoot = new Map();
  for (let index = 0; index < indices.length; index += 3) {
    const root = find(welded[indices[index]]);
    const faces = facesByRoot.get(root) ?? [];
    faces.push(indices.slice(index, index + 3));
    facesByRoot.set(root, faces);
  }
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  return [...facesByRoot.values()].map((faces) => {
    const componentBounds = new THREE.Box3();
    const areaCentroid = new THREE.Vector3();
    const componentVertices = new Map();
    const adjacency = new Map();
    let area = 0;
    for (const face of faces) {
      const points = face.map((vertex) => new THREE.Vector3(
        positions[vertex * 3],
        positions[vertex * 3 + 1],
        positions[vertex * 3 + 2],
      ).sub(bottomCenter));
      const keys = face.map((vertex, index) => {
        const point = points[index];
        const key = [point.x, point.y, point.z]
          .map((value) => Math.round(value / tolerance)).join(":");
        componentVertices.set(key, point);
        adjacency.set(key, adjacency.get(key) ?? new Set());
        return key;
      });
      for (let edge = 0; edge < 3; edge += 1) {
        const first = keys[edge];
        const second = keys[(edge + 1) % 3];
        adjacency.get(first).add(second);
        adjacency.get(second).add(first);
      }
      [a, b, c].forEach((target, index) => target.copy(points[index]));
      points.forEach((point) => componentBounds.expandByPoint(point));
      const faceArea = cross.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() * 0.5;
      area += faceArea;
      areaCentroid.add(a.clone().add(b).add(c).multiplyScalar(faceArea / 3));
    }
    if (area > 0) areaCentroid.multiplyScalar(1 / area);
    const componentSize = componentBounds.getSize(new THREE.Vector3());
    const measurement = {
      triangleCount: faces.length,
      vertexCount: componentVertices.size,
      surfaceArea: area,
      surfaceAreaFraction: null,
      bounds: {
        min: componentBounds.min.toArray(),
        max: componentBounds.max.toArray(),
        size: componentSize.toArray(),
      },
      areaCentroid: areaCentroid.toArray(),
    };
    if (faces.length === 4) {
      measurement.vertices = [...componentVertices.values()]
        .map((point) => point.toArray())
        .sort((left, right) =>
          left[1] - right[1] || left[0] - right[0] || left[2] - right[2]
        );
    }
    if (faces.length >= 100) {
      const capKeys = [...adjacency]
        .filter(([, neighbours]) => neighbours.size >= 10)
        .map(([key]) => key)
        .sort((left, right) => componentVertices.get(left).y - componentVertices.get(right).y);
      if (capKeys.length >= 2) {
        const bottomCap = capKeys[0];
        const topCap = capKeys.at(-1);
        const seen = new Set([bottomCap]);
        let frontier = [...adjacency.get(bottomCap)];
        const topologyRings = [];
        while (frontier.length > 1) {
          frontier.forEach((key) => seen.add(key));
          topologyRings.push(frontier);
          const next = new Set();
          frontier.forEach((key) => adjacency.get(key).forEach((neighbour) => {
            if (!seen.has(neighbour)) next.add(neighbour);
          }));
          frontier = [...next];
        }
        measurement.topologyProfile = {
          bottomCap: componentVertices.get(bottomCap).toArray(),
          topCap: componentVertices.get(topCap).toArray(),
          rings: topologyRings.map((ringKeys) => {
            const ring = ringKeys.map((key) => componentVertices.get(key));
            const center = ring.reduce(
              (sum, point) => sum.add(point),
              new THREE.Vector3(),
            ).multiplyScalar(1 / ring.length);
            const radii = ring.map((point) => point.distanceTo(center));
            return {
              center: center.toArray(),
              vertexCount: ring.length,
              radiusMean: radii.reduce((sum, value) => sum + value, 0) / ring.length,
              radiusMinimum: Math.min(...radii),
              radiusMaximum: Math.max(...radii),
            };
          }),
        };
      }
    }
    return measurement;
  }).sort((left, right) => right.surfaceArea - left.surfaceArea);
}

const io = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression])
  .registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "draco3d.encoder": await draco3d.createEncoderModule(),
  });
const document = await io.read(INPUT);
const objects = [];
for (const spec of LAB_SCENE.objects.filter(({ id }) => OBJECT_IDS.has(id))) {
  const nodes = document.getRoot().listNodes().filter(
    (node) => node.getName() === spec.sourceNode && node.getMesh(),
  );
  if (nodes.length !== 1) throw new Error(`${spec.id} source node is ambiguous`);
  const components = componentMeasurements(geometryOf(nodes[0]));
  const totalArea = components.reduce((sum, component) => sum + component.surfaceArea, 0);
  components.forEach((component) => {
    component.surfaceAreaFraction = component.surfaceArea / totalArea;
  });
  objects.push({ objectId: spec.id, componentCount: components.length, components });
}
const report = {
  schemaVersion: "stage2-component-measurements-v1",
  artifactRole: "development-only-ground-truth-measurements",
  productionUse: "prohibited",
  objects,
};
await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`Stage 2 component measurements: wrote ${path.relative(PROJECT_ROOT, OUTPUT)}\n`);
