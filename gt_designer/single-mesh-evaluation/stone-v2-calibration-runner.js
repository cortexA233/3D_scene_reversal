import * as THREE from "three";

import {
  aggregateGeometryEvidence,
  evaluateGeometryView,
} from "/dev-tools/evaluation/visual-metrics.mjs";
import {
  compressStoneProfile,
  createLocalReferenceClone,
  createStoneStructuralSubstitute,
  createStoneSupportHull,
  shearStoneGeometry,
} from "/dev-tools/evaluation/calibration-perturbations.mjs";
import {
  stoneGeometryV2CalibrationContractDefinition,
} from "/dev-tools/evaluation/stone-v2-calibration-contract.mjs";
import { createEvaluationHarness } from "./evaluation-harness.js";
import {
  CANONICAL_MAX_DIMENSION,
  EVALUATION_PROTOCOL_VERSION,
  EVALUATION_VIEWS,
  createEvaluationManifest,
} from "./evaluation-protocol.js";
import { loadAuthoredReference } from "./reference-loader.js";

const GEOMETRY_PASSES = Object.freeze([
  "silhouette",
  "linear-depth",
  "world-normal",
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

async function captureSet(harness, target) {
  const captures = new Map();
  for (const view of EVALUATION_VIEWS) {
    for (const passId of GEOMETRY_PASSES) {
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

function compareGeometry({
  manifest,
  referenceCaptures,
  replacementCaptures,
  referenceBounds,
  replacementRoot,
}) {
  const replacementBounds = boundsOf(replacementRoot);
  const perView = EVALUATION_VIEWS.map((view) => ({
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
  return { perView, aggregate: aggregateGeometryEvidence(perView) };
}

function resetReplacement(root, baseGeometry) {
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.geometry = baseGeometry;
  root.updateMatrixWorld(true);
}

function applyScenario({ root, baseGeometry, manifest, scenario }) {
  const parameters = scenario.parameters;
  if (scenario.family === "uniform-scale") {
    root.scale.setScalar(parameters.factor);
  } else if (scenario.family === "canonical-pivot-offset") {
    root.position.x =
      parameters.offset / manifest.framing.referenceTransform.uniformScale;
  } else if (scenario.family === "rotation-y") {
    root.rotation.y = THREE.MathUtils.degToRad(parameters.degrees);
  } else if (scenario.family === "anisotropic-scale") {
    root.scale.x = parameters.xFactor;
  } else if (scenario.family === "profile-compression") {
    root.geometry = compressStoneProfile(
      baseGeometry,
      parameters.exponentDelta,
    );
  } else if (scenario.family === "support-direction-count") {
    root.geometry = createStoneSupportHull(
      baseGeometry,
      parameters.directionCount,
    );
  } else if (scenario.family === "shear-x-by-y") {
    root.geometry = shearStoneGeometry(baseGeometry, parameters.factor);
  } else if (scenario.family === "structural-substitute") {
    root.geometry = createStoneStructuralSubstitute(
      baseGeometry,
      parameters.shape,
    );
  } else if (scenario.family === "squash-y") {
    root.scale.y = parameters.yFactor;
  } else {
    throw new Error(`unsupported Stone v2 scenario family: ${scenario.family}`);
  }
  root.updateMatrixWorld(true);
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

export async function runStoneGeometryV2ReferenceCalibration({
  canvas,
  runIndex,
  onProgress = () => {},
}) {
  const contract = stoneGeometryV2CalibrationContractDefinition();
  onProgress("Loading Stone Authored Reference");
  const reference = await loadAuthoredReference("stone");
  const replacementRoot = createLocalReferenceClone(reference);
  const baseGeometry = replacementRoot.geometry;
  const manifest = createEvaluationManifest("stone", reference.worldBounds);
  const harness = createEvaluationHarness({
    canvas,
    referenceRoot: reference.root,
    replacementRoot,
    manifest,
  });
  const generatedGeometries = new Set();
  try {
    const referenceCaptures = await captureSet(harness, "reference");
    const referenceBounds = boundsOf(reference.root);
    resetReplacement(replacementRoot, baseGeometry);
    const identityBaseline = await captureSet(harness, "replacement");
    const identityRepeat = await captureSet(harness, "replacement");
    const identity = {
      baselineCaptureChecksums: captureChecksums(identityBaseline),
      repeatCaptureChecksums: captureChecksums(identityRepeat),
      comparison: compareGeometry({
        manifest,
        referenceCaptures,
        replacementCaptures: identityBaseline,
        referenceBounds,
        replacementRoot,
      }),
    };

    const scenarios = [];
    for (let index = 0; index < contract.scenarios.length; index += 1) {
      const scenario = contract.scenarios[index];
      onProgress(
        `Stone v2 run ${runIndex}: ${index + 1}/${contract.scenarios.length} ${scenario.id}`,
      );
      resetReplacement(replacementRoot, baseGeometry);
      applyScenario({
        root: replacementRoot,
        baseGeometry,
        manifest,
        scenario,
      });
      if (replacementRoot.geometry !== baseGeometry) {
        generatedGeometries.add(replacementRoot.geometry);
      }
      const captures = await captureSet(harness, "replacement");
      const comparison = compareGeometry({
        manifest,
        referenceCaptures,
        replacementCaptures: captures,
        referenceBounds,
        replacementRoot,
      });
      scenarios.push({
        ...scenario,
        aggregate: comparison.aggregate,
        perView: comparison.perView,
        captureChecksums: captureChecksums(captures),
      });
    }
    return {
      schemaVersion: "stone-geometry-v2-reference-calibration-run-v1",
      artifactRole: "development-only-authored-reference-calibration",
      productionUse: "prohibited",
      objectId: "stone",
      runIndex,
      evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
      contractSchemaVersion: contract.schemaVersion,
      baselineVersion: contract.baselineVersion,
      manifest,
      referenceCaptureChecksums: captureChecksums(referenceCaptures),
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
    generatedGeometries.forEach((geometry) => geometry.dispose());
    replacementRoot.geometry = baseGeometry;
    cleanupRoot(reference.root);
    cleanupRoot(replacementRoot);
  }
}
