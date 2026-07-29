import * as THREE from "three";

function fnv1a(bytes) {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function typedArrayEvidence(array) {
  return {
    constructor: array.constructor.name,
    length: array.length,
    byteLength: array.byteLength,
    checksum: fnv1a(
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength),
    ),
  };
}

function materialEvidence(material) {
  if (Array.isArray(material)) return material.map(materialEvidence);
  return {
    type: material.type,
    color: material.color?.getHex() ?? null,
    emissive: material.emissive?.getHex() ?? null,
    roughness: material.roughness ?? null,
    metalness: material.metalness ?? null,
    opacity: material.opacity,
    transparent: material.transparent,
    side: material.side,
    vertexColors: material.vertexColors,
    hasRuntimeTexture: [
      "map",
      "alphaMap",
      "normalMap",
      "roughnessMap",
      "metalnessMap",
      "emissiveMap",
    ].some((slot) => Boolean(material[slot])),
  };
}

function drawCallsForMesh(mesh) {
  if (!Array.isArray(mesh.material)) return 1;
  if (mesh.geometry.groups.length > 0) return mesh.geometry.groups.length;
  return mesh.material.length;
}

export function disposeGeneratedRoot(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const entries = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];
    entries.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export function snapshotGeneratedRoot(root) {
  if (!root?.isObject3D) throw new TypeError("root must be a THREE.Object3D");
  root.updateMatrixWorld(true);
  const objects = [];
  let triangles = 0;
  let drawCalls = 0;
  let geometryMemoryBytes = 0;
  let runtimeTextureCount = 0;
  root.traverse((object) => {
    const record = {
      semanticId: object.userData.semanticId ?? null,
      parentSemanticId: object.parent?.userData.semanticId ?? null,
      type: object.type,
      position: object.position.toArray(),
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
      scale: object.scale.toArray(),
      visible: object.visible,
    };
    if (object.isMesh) {
      drawCalls += drawCallsForMesh(object);
      const geometry = object.geometry;
      const attributes = {};
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        attributes[name] = typedArrayEvidence(attribute.array);
        geometryMemoryBytes += attribute.array.byteLength;
      }
      const index = geometry.index
        ? typedArrayEvidence(geometry.index.array)
        : null;
      if (index) geometryMemoryBytes += geometry.index.array.byteLength;
      triangles += geometry.index
        ? geometry.index.count / 3
        : geometry.getAttribute("position").count / 3;
      const material = materialEvidence(object.material);
      const materialEntries = Array.isArray(material) ? material : [material];
      runtimeTextureCount += materialEntries.filter(
        (entry) => entry.hasRuntimeTexture,
      ).length;
      record.geometry = {
        type: geometry.type,
        attributes,
        index,
        groups: geometry.groups.map((group) => ({ ...group })),
      };
      record.material = material;
    }
    objects.push(record);
  });
  const bounds = new THREE.Box3().setFromObject(root);
  return {
    semanticHierarchy: objects.map((object) => ({
      semanticId: object.semanticId,
      parentSemanticId: object.parentSemanticId,
      type: object.type,
    })),
    objects,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    triangles,
    drawCalls,
    geometryMemoryBytes,
    runtimeTextureCount,
  };
}

export function crossEngineSignature(snapshot) {
  return {
    semanticHierarchy: snapshot.semanticHierarchy,
    objects: snapshot.objects.map((object) => ({
      semanticId: object.semanticId,
      parentSemanticId: object.parentSemanticId,
      type: object.type,
      geometry: object.geometry
        ? {
            type: object.geometry.type,
            attributes: Object.fromEntries(
              Object.entries(object.geometry.attributes).map(([name, value]) => [
                name,
                {
                  constructor: value.constructor,
                  length: value.length,
                },
              ]),
            ),
            index: object.geometry.index
              ? {
                  constructor: object.geometry.index.constructor,
                  length: object.geometry.index.length,
                }
              : null,
            groups: object.geometry.groups,
          }
        : null,
    })),
    bounds: snapshot.bounds,
    triangles: snapshot.triangles,
    drawCalls: snapshot.drawCalls,
  };
}

export function compareCrossEngineSignatures(
  reference,
  candidate,
  boundsTolerance,
) {
  if (!Number.isFinite(boundsTolerance) || boundsTolerance < 0) {
    throw new RangeError("boundsTolerance must be a non-negative finite number");
  }
  const structuralReference = { ...reference, bounds: null };
  const structuralCandidate = { ...candidate, bounds: null };
  const structureMatches =
    JSON.stringify(structuralReference) === JSON.stringify(structuralCandidate);
  const boundDifferences = reference.bounds.min.map((value, axis) =>
    Math.abs(candidate.bounds.min[axis] - value),
  );
  boundDifferences.push(
    ...reference.bounds.max.map((value, axis) =>
      Math.abs(candidate.bounds.max[axis] - value),
    ),
  );
  return {
    structureMatches,
    maximumBoundsDifference: Math.max(...boundDifferences),
    boundsTolerance,
    boundsMatch: boundDifferences.every(
      (difference) => difference <= boundsTolerance,
    ),
    passed:
      structureMatches &&
      boundDifferences.every((difference) => difference <= boundsTolerance),
  };
}

export function canonicalRecipeEvidence(recipe) {
  const serialized = JSON.stringify(recipe);
  return {
    encoding: "canonical-minified-utf8-json",
    bytes: new TextEncoder().encode(serialized).byteLength,
    serialized,
  };
}

function numericLeafCount(value) {
  if (typeof value === "number") return 1;
  if (Array.isArray(value)) {
    return value.reduce((sum, entry) => sum + numericLeafCount(entry), 0);
  }
  if (value && typeof value === "object") {
    return Object.values(value).reduce(
      (sum, entry) => sum + numericLeafCount(entry),
      0,
    );
  }
  return 0;
}

export function recipeScalarEvidence(recipe) {
  return {
    definition: "finite numeric leaves in the object-specific recipe",
    count: numericLeafCount(recipe),
  };
}

export function deterministicGenerationEvidence(makeRoot, repetitions = 2) {
  if (!Number.isInteger(repetitions) || repetitions < 2) {
    throw new RangeError("repetitions must be at least two");
  }
  const snapshots = [];
  for (let index = 0; index < repetitions; index += 1) {
    const root = makeRoot();
    try {
      snapshots.push(snapshotGeneratedRoot(root));
    } finally {
      disposeGeneratedRoot(root);
    }
  }
  const baseline = JSON.stringify(snapshots[0]);
  return {
    repetitions,
    byteStable: snapshots.every(
      (snapshot) => JSON.stringify(snapshot) === baseline,
    ),
    snapshot: snapshots[0],
  };
}

function percentile(values, fraction) {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

export function benchmarkGeneration(
  makeRoot,
  { warmups = 10, repetitions = 100 } = {},
) {
  if (warmups < 10 || repetitions < 100) {
    throw new RangeError("benchmark requires at least 10 warmups and 100 repetitions");
  }
  const run = () => {
    const start = performance.now();
    const root = makeRoot();
    root.updateMatrixWorld(true);
    new THREE.Box3().setFromObject(root);
    const elapsed = performance.now() - start;
    disposeGeneratedRoot(root);
    return elapsed;
  };
  for (let index = 0; index < warmups; index += 1) run();
  const milliseconds = Array.from({ length: repetitions }, run);
  return {
    warmups,
    repetitions,
    measurement:
      "semantic root, geometry attributes, generator normals/bounds, and final bounds; excludes download, shader compile, GPU upload, and disposal",
    minimumMilliseconds: Math.min(...milliseconds),
    medianMilliseconds: percentile(milliseconds, 0.5),
    p95Milliseconds: percentile(milliseconds, 0.95),
    maximumMilliseconds: Math.max(...milliseconds),
  };
}

export function benchmarkSequentialGeneration(
  makeRoots,
  { warmups = 10, repetitions = 100 } = {},
) {
  if (!Array.isArray(makeRoots) || makeRoots.length === 0) {
    throw new TypeError("makeRoots must contain generator functions");
  }
  if (makeRoots.some((makeRoot) => typeof makeRoot !== "function")) {
    throw new TypeError("makeRoots entries must be functions");
  }
  if (warmups < 10 || repetitions < 100) {
    throw new RangeError("benchmark requires at least 10 warmups and 100 repetitions");
  }
  const run = () => {
    const roots = [];
    const start = performance.now();
    try {
      for (const makeRoot of makeRoots) {
        const root = makeRoot();
        roots.push(root);
        root.updateMatrixWorld(true);
        new THREE.Box3().setFromObject(root);
      }
      return performance.now() - start;
    } finally {
      roots.forEach(disposeGeneratedRoot);
    }
  };
  for (let index = 0; index < warmups; index += 1) run();
  const milliseconds = Array.from({ length: repetitions }, run);
  return {
    warmups,
    repetitions,
    objectCount: makeRoots.length,
    measurement:
      "sequential semantic roots, geometry attributes, normals/bounds, and final bounds; excludes download, shader compile, GPU upload, and disposal",
    minimumMilliseconds: Math.min(...milliseconds),
    medianMilliseconds: percentile(milliseconds, 0.5),
    p95Milliseconds: percentile(milliseconds, 0.95),
    maximumMilliseconds: Math.max(...milliseconds),
  };
}
