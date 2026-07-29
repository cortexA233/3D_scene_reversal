import { createHash } from "node:crypto";

import { generateUmbrella } from "../../gt_designer/src/reconstruction/objects/umbrella-generator.js";
import { UMBRELLA_RECIPE } from "../../gt_designer/src/reconstruction/objects/umbrella-recipe.js";

function sha256(array) {
  if (!array) return null;
  return createHash("sha256")
    .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength))
    .digest("hex");
}

function clean(value) {
  if (Math.abs(value) < 1e-12 || Object.is(value, -0)) return 0;
  return value;
}

function geometryEvidence(geometry) {
  geometry.computeBoundingBox();
  const position = geometry.getAttribute("position");
  return {
    indexed: Boolean(geometry.index),
    vertexCount: position.count,
    triangleCount: geometry.index
      ? geometry.index.count / 3
      : position.count / 3,
    attributes: Object.fromEntries(
      Object.keys(geometry.attributes).sort().map((name) => {
        const attribute = geometry.getAttribute(name);
        return [
          name,
          {
            itemSize: attribute.itemSize,
            count: attribute.count,
            normalized: attribute.normalized,
            arrayType: attribute.array.constructor.name,
            sha256: sha256(attribute.array),
          },
        ];
      }),
    ),
    index: geometry.index
      ? {
          count: geometry.index.count,
          arrayType: geometry.index.array.constructor.name,
          sha256: sha256(geometry.index.array),
        }
      : null,
    bounds: {
      min: geometry.boundingBox.min.toArray().map(clean),
      max: geometry.boundingBox.max.toArray().map(clean),
    },
  };
}

function semanticEvidence(root) {
  const result = [];
  root.traverse((object) => {
    result.push({
      name: object.name,
      semanticId: object.userData.semanticId ?? null,
      parentSemanticId: object.parent?.userData.semanticId ?? null,
      kind: object.isMesh ? "mesh" : object.type,
      childCount: object.children.length,
    });
  });
  return result;
}

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

export function umbrellaGeometryFreezeEvidence() {
  const root = generateUmbrella(UMBRELLA_RECIPE);
  try {
    const meshes = [];
    root.traverse((object) => {
      if (!object.isMesh) return;
      meshes.push({
        name: object.name,
        semanticId: object.userData.semanticId,
        geometry: geometryEvidence(object.geometry),
      });
    });
    return {
      schemaVersion: "umbrella-geometry-freeze-v1",
      objectId: "umbrella",
      semanticId: UMBRELLA_RECIPE.id,
      generatorKind: UMBRELLA_RECIPE.kind,
      artifactRole: "development-only-geometry-and-semantic-golden-contract",
      productionUse: "prohibited",
      frozenShapeRecipe: UMBRELLA_RECIPE.shape,
      rootTransform: {
        position: root.position.toArray().map(clean),
        rotation: root.rotation.toArray().slice(0, 3).map(clean),
        scale: root.scale.toArray().map(clean),
      },
      drawBatchCount: meshes.length,
      semanticHierarchy: semanticEvidence(root),
      meshes,
    };
  } finally {
    dispose(root);
  }
}
