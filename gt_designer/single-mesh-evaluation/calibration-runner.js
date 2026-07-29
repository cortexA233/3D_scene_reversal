import * as THREE from "three";

import {
  aggregateAppearanceEvidence,
  aggregateGeometryEvidence,
  aggregateVisualEvidence,
  evaluateAppearanceView,
  evaluateGeometryView,
  evaluateQualityGate,
  qualityBaselineDefinition,
} from "/dev-tools/evaluation/visual-metrics.mjs";
import {
  evaluateStoneGeometryV2Gate,
  stoneUniformAppearanceEvidence,
} from "/dev-tools/evaluation/stone-v2-calibration-contract.mjs";
import { evaluateGeometricDiagnostics } from "/dev-tools/evaluation/geometric-diagnostics.mjs";
import {
  createLocalReferenceClone,
  quantizeRadialResolution,
  removeMeaningfulComponent,
} from "/dev-tools/evaluation/calibration-perturbations.mjs";
import { createEvaluationHarness } from "./evaluation-harness.js";
import {
  CANONICAL_MAX_DIMENSION,
  EVALUATION_PASSES,
  EVALUATION_PROTOCOL_VERSION,
  EVALUATION_VIEWS,
  createEvaluationManifest,
} from "./evaluation-protocol.js";
import { loadAuthoredReference } from "./reference-loader.js";
import { generateObject } from "../src/reconstruction/core/object-generator.js";
import { getObjectDefinition } from "../src/reconstruction/objects/object-registry.js";

export const QUALITY_CALIBRATION_SCHEMA_VERSION =
  "single-mesh-quality-calibration-v1";

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
const OBJECT_IDS = Object.freeze(["stone-path", "stone", "vase", "umbrella"]);

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

function geometryViews({
  referenceCaptures,
  replacementCaptures,
  referenceBounds,
  replacementBounds,
  manifest,
}) {
  return EVALUATION_VIEWS.map((view) => ({
    viewId: view.id,
    geometry: evaluateGeometryView({
      width: manifest.capture.width,
      height: manifest.capture.height,
      referenceSilhouette: referenceCaptures.get(
        captureKey(view.id, "silhouette"),
      ),
      replacementSilhouette: replacementCaptures.get(
        captureKey(view.id, "silhouette"),
      ),
      referenceDepth: referenceCaptures.get(
        captureKey(view.id, "linear-depth"),
      ),
      replacementDepth: replacementCaptures.get(
        captureKey(view.id, "linear-depth"),
      ),
      depthNear: manifest.framing.camera.near,
      depthFar: manifest.framing.camera.far,
      canonicalMaxDimension: CANONICAL_MAX_DIMENSION,
      referenceWorldNormal: referenceCaptures.get(
        captureKey(view.id, "world-normal"),
      ),
      replacementWorldNormal: replacementCaptures.get(
        captureKey(view.id, "world-normal"),
      ),
      referenceBounds,
      replacementBounds,
    }),
  }));
}

function appearanceViews({
  referenceCaptures,
  replacementCaptures,
  referenceMaterial,
  replacementMaterial,
  manifest,
}) {
  return EVALUATION_VIEWS.map((view) => ({
    viewId: view.id,
    appearance: evaluateAppearanceView({
      width: manifest.capture.width,
      height: manifest.capture.height,
      referenceSilhouette: referenceCaptures.get(
        captureKey(view.id, "silhouette"),
      ),
      replacementSilhouette: replacementCaptures.get(
        captureKey(view.id, "silhouette"),
      ),
      referenceAlbedo: referenceCaptures.get(captureKey(view.id, "albedo")),
      replacementAlbedo: replacementCaptures.get(captureKey(view.id, "albedo")),
      referenceLitRgb: referenceCaptures.get(captureKey(view.id, "lit-rgb")),
      replacementLitRgb: replacementCaptures.get(captureKey(view.id, "lit-rgb")),
      referenceMaterial,
      replacementMaterial,
    }),
  }));
}

function mergeViews(geometry, appearance) {
  return geometry.map((view, index) => ({
    ...view,
    appearance: appearance[index].appearance,
  }));
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

function fullComparison(context, replacementCaptures) {
  const geometry = geometryViews({
    ...context,
    replacementCaptures,
    replacementBounds: boundsOf(context.replacementRoot),
  });
  const appearance = appearanceViews({
    ...context,
    replacementCaptures,
    replacementMaterial: materialOf(context.replacementRoot),
  });
  const perView = mergeViews(geometry, appearance);
  const aggregate = aggregateVisualEvidence(perView);
  let categoryAppearance = null;
  let gate;
  if (context.geometryBaseline) {
    const geometryGate = evaluateStoneGeometryV2Gate({
      baseline: context.geometryBaseline,
      aggregate,
    });
    if (!geometryGate.passed) {
      gate = {
        baselineVersion: context.geometryBaseline.version,
        baselineVersions: {
          geometry: context.geometryBaseline.version,
          appearance: qualityBaselineDefinition().version,
        },
        objectId: context.objectId,
        passed: false,
        failures: geometryGate.failures,
        geometryGate: {
          passed: false,
          failures: geometryGate.failures,
        },
        appearanceGate: {
          evaluated: false,
          passed: null,
          reason: "geometry-gate-failed",
          failures: [],
        },
      };
    } else {
      categoryAppearance = stoneUniformAppearanceEvidence(perView);
      const appearanceProbe = evaluateQualityGate(context.objectId, {
        ...aggregate,
        appearance: categoryAppearance.hard,
        geometry: {
          ...aggregate.geometry,
          bounds: {
            maxAxisRelativeError: 0,
            bottomAnchorErrorCanonical: 0,
          },
          silhouette: {
            meanIou: 1,
            worstViewIou: 1,
            meanEdgeDistancePixels: 0,
            edgeDistanceP95Pixels: 0,
          },
          depth: { mae: 0, p95: 0 },
        },
      });
      gate = {
        ...appearanceProbe,
        baselineVersion: context.geometryBaseline.version,
        baselineVersions: {
          geometry: context.geometryBaseline.version,
          appearance: qualityBaselineDefinition().version,
        },
        geometryGate: { passed: true, failures: [] },
        appearanceGate: {
          ...appearanceProbe.appearanceGate,
          evidencePolicy: "uniform-albedo-palette-material-v1",
          geometryConditionedLitRgb: categoryAppearance.diagnostic,
        },
      };
    }
  } else {
    gate = evaluateQualityGate(context.objectId, aggregate);
  }
  return {
    perView,
    aggregate,
    categoryAppearance,
    gate,
    diagnostics: diagnosticEvidence(
      context.referenceRoot,
      context.replacementRoot,
    ),
    captureChecksums: captureChecksums(replacementCaptures),
  };
}

function geometryComparison(context, replacementCaptures) {
  const perView = geometryViews({
    ...context,
    replacementCaptures,
    replacementBounds: boundsOf(context.replacementRoot),
  });
  return {
    perView,
    aggregate: aggregateGeometryEvidence(perView),
    diagnostics: diagnosticEvidence(
      context.referenceRoot,
      context.replacementRoot,
    ),
    captureChecksums: captureChecksums(replacementCaptures),
  };
}

function appearanceComparison(context, replacementCaptures) {
  const perView = appearanceViews({
    ...context,
    replacementCaptures,
    replacementMaterial: materialOf(context.replacementRoot),
  });
  return {
    perView,
    aggregate: aggregateAppearanceEvidence(perView),
    captureChecksums: captureChecksums(replacementCaptures),
  };
}

function resetReplacement(root, baseGeometry, baseColor) {
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.geometry = baseGeometry;
  const material = Array.isArray(root.material) ? root.material[0] : root.material;
  material.color.copy(baseColor);
  root.updateMatrixWorld(true);
}

async function geometryScenario(context, definition, mutate) {
  resetReplacement(
    context.replacementRoot,
    context.baseGeometry,
    context.baseColor,
  );
  const mutation = mutate() ?? null;
  context.replacementRoot.updateMatrixWorld(true);
  const captures = await captureSet(
    context.harness,
    "replacement",
    GEOMETRY_PASSES,
  );
  const comparison = geometryComparison(context, captures);
  if (context.replacementRoot.geometry !== context.baseGeometry) {
    context.replacementRoot.geometry.dispose();
    context.replacementRoot.geometry = context.baseGeometry;
  }
  return { ...definition, mutation, comparison };
}

async function appearanceScenario(context, definition, mutate) {
  resetReplacement(
    context.replacementRoot,
    context.baseGeometry,
    context.baseColor,
  );
  const mutation = mutate() ?? null;
  const captures = await captureSet(
    context.harness,
    "replacement",
    APPEARANCE_PASSES,
  );
  return {
    ...definition,
    mutation,
    comparison: appearanceComparison(context, captures),
  };
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

async function calibrateObject(canvas, objectId, progress) {
  progress(`Loading ${objectId}`);
  const reference = await loadAuthoredReference(objectId);
  const replacementRoot = createLocalReferenceClone(reference);
  const manifest = createEvaluationManifest(objectId, reference.worldBounds);
  const harness = createEvaluationHarness({
    canvas,
    referenceRoot: reference.root,
    replacementRoot,
    manifest,
  });
  const referenceCaptures = await captureSet(harness, "reference", FULL_PASSES);
  const referenceBounds = boundsOf(reference.root);
  const referenceMaterial = materialOf(reference.root);
  const baseGeometry = replacementRoot.geometry;
  const material = Array.isArray(replacementRoot.material)
    ? replacementRoot.material[0]
    : replacementRoot.material;
  const baseColor = material.color.clone();
  const context = {
    objectId,
    manifest,
    harness,
    referenceRoot: reference.root,
    replacementRoot,
    referenceCaptures,
    referenceBounds,
    referenceMaterial,
    baseGeometry,
    baseColor,
  };

  try {
    progress(`${objectId}: repeatability`);
    const repeatedReference = await captureSet(harness, "reference", FULL_PASSES);
    const repeatContext = {
      ...context,
      replacementRoot: reference.root,
    };
    const repeatability = {
      id: `${objectId}/reference-repeat-1`,
      objectId,
      category: "reference-repeatability",
      repetition: 1,
      baselineCaptureChecksums: captureChecksums(referenceCaptures),
      comparison: fullComparison(repeatContext, repeatedReference),
    };

    progress(`${objectId}: identity copy`);
    resetReplacement(replacementRoot, baseGeometry, baseColor);
    const identityCaptures = await captureSet(harness, "replacement", FULL_PASSES);
    const identity = {
      id: `${objectId}/identity-copy`,
      objectId,
      category: "identity-copy",
      comparison: fullComparison(context, identityCaptures),
    };

    const perturbations = [];
    if (objectId === "stone-path") {
      for (const delta of [-0.05, -0.02, -0.01, 0.01, 0.02, 0.05]) {
        progress(`${objectId}: scale ${delta}`);
        perturbations.push(
          await geometryScenario(
            context,
            {
              id: `${objectId}/scale/${delta > 0 ? "+" : ""}${delta}`,
              objectId,
              category: "uniform-scale",
              magnitude: Math.abs(delta),
              signedValue: delta,
            },
            () => {
              replacementRoot.scale.setScalar(1 + delta);
            },
          ),
        );
      }
      for (const offset of [0.01, 0.05, 0.1]) {
        progress(`${objectId}: pivot ${offset}`);
        perturbations.push(
          await geometryScenario(
            context,
            {
              id: `${objectId}/pivot-x/${offset}`,
              objectId,
              category: "canonical-pivot-offset",
              magnitude: offset,
              axis: "positive-x",
              units: "canonical",
            },
            () => {
              replacementRoot.position.x =
                offset / manifest.framing.referenceTransform.uniformScale;
            },
          ),
        );
      }
      for (const degrees of [1, 3, 5]) {
        progress(`${objectId}: rotation ${degrees}`);
        perturbations.push(
          await geometryScenario(
            context,
            {
              id: `${objectId}/rotation-y/${degrees}`,
              objectId,
              category: "rotation-y",
              magnitude: degrees,
              units: "degrees",
            },
            () => {
              replacementRoot.rotation.y = THREE.MathUtils.degToRad(degrees);
            },
          ),
        );
      }
      for (const factor of [0.98, 0.9, 0.7]) {
        progress(`${objectId}: color ${factor}`);
        perturbations.push(
          await appearanceScenario(
            context,
            {
              id: `${objectId}/base-color-factor/${factor}`,
              objectId,
              category: "base-color-factor",
              magnitude: 1 - factor,
              linearRgbFactor: factor,
            },
            () => {
              material.color.copy(baseColor).multiplyScalar(factor);
            },
          ),
        );
      }
    } else if (objectId === "vase") {
      for (const segmentCount of [8, 4]) {
        progress(`${objectId}: radial ${segmentCount}`);
        perturbations.push(
          await geometryScenario(
            context,
            {
              id: `${objectId}/radial-segments/${segmentCount}`,
              objectId,
              category: "reduced-radial-resolution",
              magnitude: 1 / segmentCount,
              segmentCount,
            },
            () => {
              replacementRoot.geometry = quantizeRadialResolution(
                baseGeometry,
                segmentCount,
              );
            },
          ),
        );
      }
    } else if (objectId === "umbrella") {
      progress(`${objectId}: component deletion`);
      perturbations.push(
        await geometryScenario(
          context,
          {
            id: `${objectId}/delete-component`,
            objectId,
            category: "meaningful-component-deletion",
          },
          () => {
            const result = removeMeaningfulComponent(baseGeometry);
            replacementRoot.geometry = result.geometry;
            return result.metadata;
          },
        ),
      );
    }
    return { objectId, repeatability, identity, perturbations };
  } finally {
    harness.dispose();
    cleanupRoot(reference.root);
    cleanupRoot(replacementRoot);
  }
}

export async function runQualityCalibration({ canvas, onProgress = () => {} }) {
  const objects = [];
  for (const objectId of OBJECT_IDS) {
    objects.push(await calibrateObject(canvas, objectId, onProgress));
  }
  onProgress("Calibration captures complete");
  return {
    schemaVersion: QUALITY_CALIBRATION_SCHEMA_VERSION,
    artifactRole: "development-only-quality-calibration",
    productionUse: "prohibited",
    evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
    qualityBaseline: qualityBaselineDefinition(),
    calibrationPolicy: {
      maximumCorrectionsBeforeReplacementFitting: 1,
      correctionsUsed: 0,
      thresholdsFrozenAfterThisReport: true,
      replacementFailuresMayRelaxThresholds: false,
    },
    environment: {
      threeRevision: THREE.REVISION,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      captureBackend: "browser-webgl-rgba8",
    },
    conventions: {
      pivotOffsetAxis: "positive canonical X",
      rotationAxis: "positive source-world Y through Reconstruction Frame origin",
      colorPerturbation: "uniform linear-RGB material base-color factor",
      pointDistance:
        "diagnostic bidirectional nearest-neighbor distance over canonical position-attribute vertices; duplicates retained",
    },
    objects,
  };
}

export async function runObjectEvaluation({
  canvas,
  objectId,
  geometryBaseline = null,
  onProgress = () => {},
}) {
  onProgress(`Loading ${objectId}`);
  const reference = await loadAuthoredReference(objectId);
  const definition = getObjectDefinition(objectId);
  const replacementRoot = generateObject(definition.recipe, definition.generator);
  const manifest = createEvaluationManifest(objectId, reference.worldBounds);
  const harness = createEvaluationHarness({
    canvas,
    referenceRoot: reference.root,
    replacementRoot,
    manifest,
  });
  try {
    onProgress(`${objectId}: reference captures`);
    const passIds = EVALUATION_PASSES.map((pass) => pass.id);
    const referenceCaptures = await captureSet(harness, "reference", passIds);
    onProgress(`${objectId}: replacement captures`);
    const replacementCaptures = await captureSet(harness, "replacement", passIds);
    const context = {
      objectId,
      manifest,
      harness,
      referenceRoot: reference.root,
      replacementRoot,
      referenceCaptures,
      referenceBounds: boundsOf(reference.root),
      referenceMaterial: materialOf(reference.root),
      geometryBaseline,
    };
    const comparison = fullComparison(context, replacementCaptures);
    harness.preview({
      viewId: EVALUATION_VIEWS[0].id,
      passId: "lit-rgb",
      mode: "difference",
    });
    return {
      schemaVersion: "single-mesh-object-evaluation-v1",
      artifactRole: "development-only-object-acceptance",
      productionUse: "prohibited",
      objectId,
      semanticId: definition.recipe.id,
      evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
      qualityBaseline: geometryBaseline
        ? {
            geometry: geometryBaseline,
            appearance: {
              version: qualityBaselineDefinition().version,
              thresholds: qualityBaselineDefinition().appearance[objectId],
            },
          }
        : qualityBaselineDefinition(),
      manifest,
      captures: {
        expectedCount: EVALUATION_VIEWS.length * passIds.length * 2,
        referenceChecksums: captureChecksums(referenceCaptures),
        replacementChecksums: captureChecksums(replacementCaptures),
      },
      comparison,
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
