import { NodeIO } from "@gltf-transform/core";
import { KHRDracoMeshCompression } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { LAB_SCENE } from "../../gt_designer/single-mesh-lab/scene-config.js";
import { generateObject } from "../../gt_designer/src/reconstruction/core/object-generator.js";
import { getObjectDefinition } from "../../gt_designer/src/reconstruction/objects/object-registry.js";

/**
 * The eight-unit regression corpus, in the exact form the CPU rasterizer needs.
 *
 * The eight existing Reconstruction Units are the regression corpus: their
 * recipes and generators are known to the pipeline, so they prove tooling
 * correctness and never generalisation. This module only reads them — no
 * generator, recipe, or definition is modified, and none is refactored to import
 * anything new.
 *
 * Normals are produced the way the browser evaluation harness consumes them,
 * which is not the textbook way:
 *
 *   · the Authored Reference is loaded as `geometry.applyMatrix4(node.matrixWorld)`,
 *     which pushes the authored NORMAL attribute through the proper normal matrix
 *     and renormalizes;
 *   · the harness's world-normal shader then uses `normalize(mat3(modelMatrix) * normal)`
 *     — the plain upper-left 3×3, not its inverse transpose. Reproducing that
 *     choice matters: using the inverse transpose here would show up as
 *     rasterizer-versus-browser divergence that is really a convention mismatch.
 */

export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const AUTHORED_REFERENCE = path.join(
  PROJECT_ROOT,
  "gt_designer/data/island-village.glb",
);

/** Corpus order follows the Eight-slot Lab Reference Layout's declared order. */
export const REGRESSION_UNIT_IDS = Object.freeze(
  LAB_SCENE.objects.map((spec) => spec.id),
);

let documentPromise = null;

async function authoredDocument() {
  if (!documentPromise) {
    documentPromise = (async () => {
      const decoder = await draco3d.createDecoderModule();
      const io = new NodeIO()
        .registerExtensions([KHRDracoMeshCompression])
        .registerDependencies({ "draco3d.decoder": decoder });
      return io.read(AUTHORED_REFERENCE);
    })();
  }
  return documentPromise;
}

function boundsOf(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[offset + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  return { min, max, size: max.map((value, axis) => value - min[axis]) };
}

function normalizeInPlace(normals) {
  for (let offset = 0; offset < normals.length; offset += 3) {
    const lengthSquared =
      normals[offset] ** 2 + normals[offset + 1] ** 2 + normals[offset + 2] ** 2;
    if (lengthSquared === 0) continue;
    const inverse = 1 / Math.sqrt(lengthSquared);
    normals[offset] *= inverse;
    normals[offset + 1] *= inverse;
    normals[offset + 2] *= inverse;
  }
  return normals;
}

function areaWeightedNormals(positions, indices) {
  const normals = new Float64Array(positions.length);
  for (let face = 0; face < indices.length; face += 3) {
    const a = indices[face] * 3;
    const b = indices[face + 1] * 3;
    const c = indices[face + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const corner of [a, b, c]) {
      normals[corner] += nx;
      normals[corner + 1] += ny;
      normals[corner + 2] += nz;
    }
  }
  return normalizeInPlace(normals);
}

/**
 * The Authored Reference for one unit, in source-world coordinates with normals
 * matching what the browser reference loader produces.
 */
export async function loadReferenceGeometry(unitId) {
  const spec = LAB_SCENE.objects.find((candidate) => candidate.id === unitId);
  if (!spec) throw new Error(`Unknown Reconstruction Unit: ${unitId}`);
  const document = await authoredDocument();
  const matches = document
    .getRoot()
    .listNodes()
    .filter((node) => node.getName() === spec.sourceNode && node.getMesh());
  if (matches.length !== 1) {
    throw new Error(
      `Expected one mesh node named "${spec.sourceNode}", found ${matches.length}`,
    );
  }
  const node = matches[0];
  const worldMatrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();

  const positions = [];
  const normals = [];
  const indices = [];
  let hasAuthoredNormals = true;

  for (const primitive of node.getMesh().listPrimitives()) {
    if (primitive.getMode() !== 4) {
      throw new Error(`${spec.sourceNode} has a primitive that is not TRIANGLES`);
    }
    const positionArray = primitive.getAttribute("POSITION")?.getArray();
    if (!positionArray) throw new Error(`${spec.sourceNode} has no POSITION`);
    const normalArray = primitive.getAttribute("NORMAL")?.getArray() ?? null;
    if (!normalArray) hasAuthoredNormals = false;

    const vertexOffset = positions.length / 3;
    for (let offset = 0; offset < positionArray.length; offset += 3) {
      point
        .set(positionArray[offset], positionArray[offset + 1], positionArray[offset + 2])
        .applyMatrix4(worldMatrix);
      positions.push(point.x, point.y, point.z);
      if (normalArray) {
        direction
          .set(normalArray[offset], normalArray[offset + 1], normalArray[offset + 2])
          .applyMatrix3(normalMatrix)
          .normalize();
        normals.push(direction.x, direction.y, direction.z);
      }
    }
    const indexArray = primitive.getIndices()?.getArray();
    const primitiveIndices = indexArray
      ? Array.from(indexArray)
      : Array.from({ length: positionArray.length / 3 }, (_, index) => index);
    for (const index of primitiveIndices) indices.push(vertexOffset + index);
  }

  const positionArray = Float64Array.from(positions);
  const indexArray = Uint32Array.from(indices);
  const materials = new Set(
    node
      .getMesh()
      .listPrimitives()
      .map((primitive) => primitive.getMaterial()?.getName() ?? "unnamed"),
  );
  return {
    unitId,
    label: spec.label,
    materialCount: materials.size,
    positions: positionArray,
    normals: hasAuthoredNormals
      ? Float64Array.from(normals)
      : areaWeightedNormals(positionArray, indexArray),
    normalSource: hasAuthoredNormals ? "authored-NORMAL-attribute" : "area-weighted-derived",
    indices: indexArray,
    worldBounds: boundsOf(positionArray),
  };
}

/**
 * The accepted Procedural Replacement for one unit, generated from its frozen
 * recipe, flattened to object-local world space with normals prepared the way
 * the harness's shader consumes them.
 */
export function buildReplacementGeometry(unitId) {
  const definition = getObjectDefinition(unitId);
  const root = generateObject(definition.recipe, definition.generator);

  // The harness's frame assigns `root.position` from the replacement transform's
  // `translationBeforeScale`, which is always the origin — so a generated root's
  // own position is discarded before capture. Mushroom is the one unit where this
  // matters: its root carries y = -0.019646, and every frozen browser number for
  // it was produced with that offset overwritten. Reproducing the overwrite is
  // faithfulness to the measured semantics, not a correction to the generator.
  const discardedRootPosition = root.position.toArray();
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);

  const positions = [];
  const normals = [];
  const indices = [];
  const parts = [];
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();

  root.traverse((object) => {
    if (!object.isMesh) return;
    const position = object.geometry.getAttribute("position");
    if (!position) return;
    let normal = object.geometry.getAttribute("normal");
    if (!normal) {
      object.geometry.computeVertexNormals();
      normal = object.geometry.getAttribute("normal");
    }
    // `mat3(modelMatrix)`, matching the harness shader rather than the textbook
    // inverse transpose.
    const linear = new THREE.Matrix3().setFromMatrix4(object.matrixWorld);
    const vertexOffset = positions.length / 3;
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
      positions.push(point.x, point.y, point.z);
      direction.fromBufferAttribute(normal, index).applyMatrix3(linear).normalize();
      normals.push(direction.x, direction.y, direction.z);
    }
    const sourceIndices = object.geometry.index
      ? Array.from(object.geometry.index.array)
      : Array.from({ length: position.count }, (_, index) => index);
    for (const index of sourceIndices) indices.push(vertexOffset + index);
    parts.push({
      semanticId: object.userData.semanticId ?? null,
      triangleCount: sourceIndices.length / 3,
      vertexCount: position.count,
    });
  });

  if (positions.length === 0) {
    throw new Error(`${unitId} generated no renderable geometry`);
  }
  const positionArray = Float64Array.from(positions);
  return {
    unitId,
    label: definition.label,
    semanticId: root.userData.semanticId,
    positions: positionArray,
    normals: Float64Array.from(normals),
    indices: Uint32Array.from(indices),
    parts,
    drawCallCount: parts.length,
    triangleCount: indices.length / 3,
    localBounds: boundsOf(positionArray),
    discardedRootPosition,
    rootPositionDiscardedByFrame: discardedRootPosition.some((value) => value !== 0),
  };
}

export { boundsOf };
