import * as THREE from "three";

import {
  aggregateAppearanceEvidence,
  aggregateGeometryEvidence,
  aggregateVisualEvidence,
  evaluateAppearanceView,
  evaluateGeometryView,
} from "/dev-tools/evaluation/visual-metrics.mjs";
import { evaluateGeometricDiagnostics } from "/dev-tools/evaluation/geometric-diagnostics.mjs";
import {
  createLocalReferenceClone,
  quantizeRadialResolution,
  removeMeaningfulComponent,
  removeMeaningfulComponentFamily,
} from "/dev-tools/evaluation/calibration-perturbations.mjs";
import { createEvaluationHarness } from "./evaluation-harness.js";
import {
  CANONICAL_MAX_DIMENSION,
  EVALUATION_VIEWS,
  createEvaluationManifest,
} from "./evaluation-protocol.js";
import { loadAuthoredReference } from "./reference-loader.js";

const OBJECT_IDS = Object.freeze([
  "bamboo-shoot",
  "mushroom",
  "blue-hat",
  "candle",
]);
const FULL_PASSES = Object.freeze([
  "silhouette",
  "linear-depth",
  "world-normal",
  "albedo",
  "lit-rgb",
]);
const GEOMETRY_PASSES = Object.freeze([
  "silhouette",
  "linear-depth",
  "world-normal",
]);
const APPEARANCE_PASSES = Object.freeze([
  "silhouette",
  "albedo",
  "lit-rgb",
]);

function checksum(bytes) {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function captureKey(viewId, passId) {
  return `${viewId}/${passId}`;
}

async function captureSet(harness, target, passIds) {
  const captures = new Map();
  for (const view of EVALUATION_VIEWS) {
    for (const passId of passIds) {
      const capture = harness.capture({ viewId: view.id, passId, target });
      captures.set(captureKey(view.id, passId), capture.pixels);
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return captures;
}

function captureChecksums(captures) {
  return Object.fromEntries(
    Array.from(captures, ([key, pixels]) => [key, checksum(pixels)]),
  );
}

function boundsOf(root) {
  root.updateWorldMatrix(true, false);
  const bounds = new THREE.Box3().setFromObject(root);
  return { min: bounds.min.toArray(), max: bounds.max.toArray() };
}

function materialOf(root) {
  let material = null;
  root.traverse((object) => {
    if (!material && object.isMesh) {
      material = Array.isArray(object.material)
        ? object.material[0]
        : object.material;
    }
  });
  if (!material) throw new Error("calibration root has no material");
  return {
    roughness: material.roughness ?? 1,
    metalness: material.metalness ?? 0,
  };
}

function canonicalGeometry(root) {
  root.updateWorldMatrix(true, false);
  const positions = [];
  const indices = [];
  const point = new THREE.Vector3();
  root.traverse((object) => {
    if (!object.isMesh) return;
    const position = object.geometry.getAttribute("position");
    if (!position) return;
    const offset = positions.length / 3;
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
      positions.push(point.x, point.y, point.z);
    }
    const sourceIndices = object.geometry.index
      ? object.geometry.index.array
      : Array.from({ length: position.count }, (_, index) => index);
    for (const index of sourceIndices) indices.push(offset + index);
  });
  return { positions, indices };
}

function diagnosticEvidence(referenceRoot, replacementRoot) {
  const reference = canonicalGeometry(referenceRoot);
  const replacement = canonicalGeometry(replacementRoot);
  return evaluateGeometricDiagnostics({
    referencePositions: reference.positions,
    referenceIndices: reference.indices,
    replacementPositions: replacement.positions,
    replacementIndices: replacement.indices,
  });
}

function geometryViews(context, replacementCaptures) {
  const replacementBounds = boundsOf(context.replacementRoot);
  return EVALUATION_VIEWS.map((view) => ({
    viewId: view.id,
    geometry: evaluateGeometryView({
      width: context.manifest.capture.width,
      height: context.manifest.capture.height,
      referenceSilhouette: context.referenceCaptures.get(captureKey(view.id, "silhouette")),
      replacementSilhouette: replacementCaptures.get(captureKey(view.id, "silhouette")),
      referenceDepth: context.referenceCaptures.get(captureKey(view.id, "linear-depth")),
      replacementDepth: replacementCaptures.get(captureKey(view.id, "linear-depth")),
      depthNear: context.manifest.framing.camera.near,
      depthFar: context.manifest.framing.camera.far,
      canonicalMaxDimension: CANONICAL_MAX_DIMENSION,
      referenceWorldNormal: context.referenceCaptures.get(captureKey(view.id, "world-normal")),
      replacementWorldNormal: replacementCaptures.get(captureKey(view.id, "world-normal")),
      referenceBounds: context.referenceBounds,
      replacementBounds,
    }),
  }));
}

function appearanceViews(context, replacementCaptures) {
  const replacementMaterial = materialOf(context.replacementRoot);
  return EVALUATION_VIEWS.map((view) => ({
    viewId: view.id,
    appearance: evaluateAppearanceView({
      width: context.manifest.capture.width,
      height: context.manifest.capture.height,
      referenceSilhouette: context.referenceCaptures.get(captureKey(view.id, "silhouette")),
      replacementSilhouette: replacementCaptures.get(captureKey(view.id, "silhouette")),
      referenceAlbedo: context.referenceCaptures.get(captureKey(view.id, "albedo")),
      replacementAlbedo: replacementCaptures.get(captureKey(view.id, "albedo")),
      referenceLitRgb: context.referenceCaptures.get(captureKey(view.id, "lit-rgb")),
      replacementLitRgb: replacementCaptures.get(captureKey(view.id, "lit-rgb")),
      referenceMaterial: context.referenceMaterial,
      replacementMaterial,
    }),
  }));
}

function rawFullComparison(context, replacementCaptures) {
  const geometry = geometryViews(context, replacementCaptures);
  const appearance = appearanceViews(context, replacementCaptures);
  const perView = geometry.map((view, index) => ({
    ...view,
    appearance: appearance[index].appearance,
  }));
  return {
    perView,
    aggregate: aggregateVisualEvidence(perView),
    diagnostics: diagnosticEvidence(context.referenceRoot, context.replacementRoot),
    captureChecksums: captureChecksums(replacementCaptures),
  };
}

function reset(context) {
  const root = context.replacementRoot;
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.geometry = context.baseGeometry;
  context.material.color.copy(context.baseColor);
  context.material.map = context.baseMap;
  context.material.needsUpdate = true;
  root.updateMatrixWorld(true);
}

async function geometryScenario(context, definition) {
  reset(context);
  const mutation = definition.mutate(context.replacementRoot, context);
  context.replacementRoot.updateMatrixWorld(true);
  const captures = await captureSet(context.harness, "replacement", GEOMETRY_PASSES);
  const perView = geometryViews(context, captures);
  const comparison = {
    perView,
    aggregate: aggregateGeometryEvidence(perView),
    diagnostics: diagnosticEvidence(context.referenceRoot, context.replacementRoot),
    captureChecksums: captureChecksums(captures),
  };
  if (context.replacementRoot.geometry !== context.baseGeometry) {
    context.replacementRoot.geometry.dispose();
    context.replacementRoot.geometry = context.baseGeometry;
  }
  return {
    id: definition.id,
    objectId: context.objectId,
    domain: "geometry",
    classification: definition.classification,
    category: definition.category,
    mutation,
    comparison,
  };
}

async function appearanceScenario(context, definition) {
  reset(context);
  const mutation = definition.mutate();
  const captures = await captureSet(context.harness, "replacement", APPEARANCE_PASSES);
  const perView = appearanceViews(context, captures);
  return {
    id: definition.id,
    objectId: context.objectId,
    domain: "appearance",
    classification: definition.classification,
    category: definition.category,
    mutation,
    comparison: {
      perView,
      aggregate: aggregateAppearanceEvidence(perView),
      captureChecksums: captureChecksums(captures),
    },
  };
}

function geometryScenarios(objectId) {
  return [
    ...[-0.025, 0.025].map((delta) => ({
      id: `${objectId}/mild-scale/${delta > 0 ? "+" : ""}${delta}`,
      classification: "should-pass",
      category: "uniform-scale",
      mutate(root) { root.scale.setScalar(1 + delta); return { delta }; },
    })),
    {
      id: `${objectId}/mild-pivot/0.015`,
      classification: "should-pass",
      category: "canonical-pivot-offset",
      mutate(root, context) {
        root.position.x = 0.015 / context.manifest.framing.referenceTransform.uniformScale;
        return { canonicalOffset: 0.015 };
      },
    },
    ...[-2, 2].map((degrees) => ({
      id: `${objectId}/mild-rotation/${degrees}`,
      classification: "should-pass",
      category: "rotation-y",
      mutate(root) { root.rotation.y = THREE.MathUtils.degToRad(degrees); return { degrees }; },
    })),
    ...[0.97, 1.03].map((factor) => ({
      id: `${objectId}/mild-proportion-y/${factor}`,
      classification: "should-pass",
      category: "axial-proportion",
      mutate(root) { root.scale.y = factor; return { factor }; },
    })),
    ...[0.85, 1.15].map((factor) => ({
      id: `${objectId}/reject-scale/${factor}`,
      classification: "must-reject",
      category: "uniform-scale",
      mutate(root) { root.scale.setScalar(factor); return { factor }; },
    })),
    {
      id: `${objectId}/reject-pivot/0.15`,
      classification: "must-reject",
      category: "canonical-pivot-offset",
      mutate(root, context) {
        root.position.x = 0.15 / context.manifest.framing.referenceTransform.uniformScale;
        return { canonicalOffset: 0.15 };
      },
    },
    {
      id: `${objectId}/reject-rotation/20`,
      classification: "must-reject",
      category: "rotation-y",
      mutate(root) { root.rotation.y = THREE.MathUtils.degToRad(20); return { degrees: 20 }; },
    },
    {
      id: `${objectId}/reject-proportion-y/0.7`,
      classification: "must-reject",
      category: "axial-proportion",
      mutate(root) { root.scale.y = 0.7; return { factor: 0.7 }; },
    },
    {
      id: `${objectId}/reject-component-deletion`,
      classification: "must-reject",
      category: "meaningful-component-deletion",
      mutate(root, context) {
        const result = objectId === "bamboo-shoot"
          ? removeMeaningfulComponentFamily(context.baseGeometry, null)
          : removeMeaningfulComponent(context.baseGeometry);
        root.geometry = result.geometry;
        return result.metadata;
      },
    },
    {
      id: `${objectId}/reject-radial-collapse/4`,
      classification: "must-reject",
      category: "radial-collapse",
      mutate(root, context) {
        root.geometry = quantizeRadialResolution(context.baseGeometry, 4);
        return { segmentCount: 4 };
      },
    },
  ];
}

function appearanceScenarios(objectId, material, baseColor) {
  return [
    {
      id: `${objectId}/mild-palette/0.98`,
      classification: "should-pass",
      category: "dominant-palette",
      mutate() {
        material.color.copy(baseColor).multiplyScalar(0.98);
        return { linearRgbFactor: 0.98 };
      },
    },
    {
      id: `${objectId}/mild-palette/cool`,
      classification: "should-pass",
      category: "dominant-palette",
      mutate() {
        material.color.copy(baseColor);
        material.color.r *= 0.98;
        material.color.b *= 1.02;
        return { linearRgbFactors: [0.98, 1, 1.02] };
      },
    },
    {
      id: `${objectId}/reject-wrong-palette`,
      classification: "must-reject",
      category: "wrong-dominant-palette",
      mutate() {
        material.color.setRGB(0.75, 0.12, 0.18);
        return { linearRgb: [0.75, 0.12, 0.18] };
      },
    },
    {
      id: `${objectId}/reject-flat-appearance`,
      classification: "must-reject",
      category: "flat-appearance",
      mutate() {
        material.map = null;
        material.color.setRGB(0.5, 0.5, 0.5);
        material.needsUpdate = true;
        return { textureRemoved: true, linearRgb: [0.5, 0.5, 0.5] };
      },
    },
  ];
}

function cleanupRoot(root) {
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

export async function runStage2Precalibration({
  canvas,
  objectId,
  runIndex,
  onProgress = () => {},
}) {
  if (!OBJECT_IDS.includes(objectId)) {
    throw new Error(`unsupported Stage 2 pre-calibration object: ${objectId}`);
  }
  if (!Number.isInteger(runIndex) || runIndex < 1) {
    throw new Error("Stage 2 pre-calibration requires a positive run index");
  }
  onProgress(`Loading ${objectId}`);
  const reference = await loadAuthoredReference(objectId);
  const replacementRoot = createLocalReferenceClone(reference);
  const manifest = createEvaluationManifest(objectId, reference.worldBounds);
  const harness = createEvaluationHarness({ canvas, referenceRoot: reference.root, replacementRoot, manifest });
  const referenceCaptures = await captureSet(harness, "reference", FULL_PASSES);
  const material = Array.isArray(replacementRoot.material)
    ? replacementRoot.material[0]
    : replacementRoot.material;
  const context = {
    objectId,
    manifest,
    harness,
    referenceRoot: reference.root,
    replacementRoot,
    referenceCaptures,
    referenceBounds: boundsOf(reference.root),
    referenceMaterial: materialOf(reference.root),
    baseGeometry: replacementRoot.geometry,
    material,
    baseColor: material.color.clone(),
    baseMap: material.map,
  };
  try {
    onProgress(`${objectId}: repeatability`);
    const repeated = await captureSet(harness, "reference", FULL_PASSES);
    const repeatability = rawFullComparison({ ...context, replacementRoot: reference.root }, repeated);
    onProgress(`${objectId}: identity`);
    const identityCaptures = await captureSet(harness, "replacement", FULL_PASSES);
    const identity = rawFullComparison(context, identityCaptures);
    const scenarios = [];
    for (const definition of geometryScenarios(objectId)) {
      onProgress(`${objectId}: ${definition.id}`);
      scenarios.push(await geometryScenario(context, definition));
    }
    for (const definition of appearanceScenarios(objectId, material, context.baseColor)) {
      onProgress(`${objectId}: ${definition.id}`);
      scenarios.push(await appearanceScenario(context, definition));
    }
    return {
      schemaVersion: "stage-2-object-precalibration-run-v1",
      artifactRole: "development-only-reference-calibration",
      productionUse: "prohibited",
      candidateUse: "prohibited",
      objectId,
      runIndex,
      manifest,
      referenceCaptureChecksums: captureChecksums(referenceCaptures),
      repeatability,
      identity,
      scenarios,
      environment: {
        threeRevision: THREE.REVISION,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        captureBackend: "browser-webgl-rgba8",
        gpu: harness.environment(),
      },
    };
  } finally {
    harness.dispose();
    cleanupRoot(reference.root);
    cleanupRoot(replacementRoot);
  }
}
