import * as THREE from "three";

import {
  aggregateAppearanceEvidence,
  evaluateAppearanceView,
} from "/dev-tools/evaluation/visual-metrics.mjs";
import { patternedAppearanceV2CalibrationContractDefinition } from "/dev-tools/evaluation/patterned-appearance-v2-contract.mjs";
import {
  aggregatePatternedAppearanceEvidence,
  evaluatePatternedAppearanceView,
} from "/dev-tools/evaluation/patterned-appearance-metrics.mjs";
import { createLocalReferenceClone } from "/dev-tools/evaluation/calibration-perturbations.mjs";
import { createEvaluationHarness } from "./evaluation-harness.js";
import {
  EVALUATION_PROTOCOL_VERSION,
  EVALUATION_VIEWS,
  createEvaluationManifest,
} from "./evaluation-protocol.js";
import { loadAuthoredReference } from "./reference-loader.js";

const PASS_IDS = Object.freeze(["silhouette", "albedo", "lit-rgb"]);
const DOMINANT_COLOR = Object.freeze([132, 128, 78]);

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
    for (const passId of PASS_IDS) {
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

function firstMesh(root) {
  let result = null;
  root.traverse((object) => {
    if (!result && object.isMesh) result = object;
  });
  if (!result) throw new Error("Umbrella reference has no mesh");
  return result;
}

function materialEvidence(root) {
  const material = firstMesh(root).material;
  const selected = Array.isArray(material) ? material[0] : material;
  return {
    roughness: selected.roughness ?? 1,
    metalness: selected.metalness ?? 0,
  };
}

function appearanceComparison({
  referenceCaptures,
  replacementCaptures,
  referenceMaterial,
  replacementMaterial,
  manifest,
}) {
  const perView = EVALUATION_VIEWS.map((view) => {
    const referenceSilhouette = referenceCaptures.get(
      captureKey(view.id, "silhouette"),
    );
    const replacementSilhouette = replacementCaptures.get(
      captureKey(view.id, "silhouette"),
    );
    const referenceAlbedo = referenceCaptures.get(captureKey(view.id, "albedo"));
    const replacementAlbedo = replacementCaptures.get(
      captureKey(view.id, "albedo"),
    );
    return {
      viewId: view.id,
      appearance: evaluateAppearanceView({
      width: manifest.capture.width,
      height: manifest.capture.height,
      referenceSilhouette,
      replacementSilhouette,
      referenceAlbedo,
      replacementAlbedo,
      referenceLitRgb: referenceCaptures.get(captureKey(view.id, "lit-rgb")),
      replacementLitRgb: replacementCaptures.get(
        captureKey(view.id, "lit-rgb"),
      ),
      referenceMaterial,
      replacementMaterial,
      }),
      patterned: evaluatePatternedAppearanceView({
        width: manifest.capture.width,
        height: manifest.capture.height,
        referenceSilhouette,
        replacementSilhouette,
        referenceAlbedo,
        replacementAlbedo,
      }),
    };
  });
  const aggregate = aggregateAppearanceEvidence(perView);
  aggregate.patterned = aggregatePatternedAppearanceEvidence(perView);
  return {
    perView,
    aggregate,
    captureChecksums: captureChecksums(replacementCaptures),
  };
}

function transformedCanvas(image, mutation) {
  const width = image.width ?? image.videoWidth;
  const height = image.height ?? image.videoHeight;
  if (!width || !height) throw new Error("Authored Umbrella texture is not ready");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D calibration context unavailable");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  const hasTransform =
    (mutation.translatePixels ?? []).some((value) => value !== 0) ||
    (mutation.rotationDegrees ?? 0) !== 0 ||
    (mutation.scale ?? 1) !== 1 ||
    (mutation.shearX ?? 0) !== 0;
  if (hasTransform) {
    const source = context.getImageData(0, 0, width, height);
    const background = new ImageData(
      new Uint8ClampedArray(source.data),
      width,
      height,
    );
    const motif = new ImageData(width, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const classification = motifClassification(
          source.data[offset],
          source.data[offset + 1],
          source.data[offset + 2],
          x,
          y,
          width,
          height,
        );
        if (!classification) continue;
        for (let channel = 0; channel < 4; channel += 1) {
          motif.data[offset + channel] = source.data[offset + channel];
        }
        replacePixel(background.data, offset);
      }
    }
    const backgroundCanvas = document.createElement("canvas");
    backgroundCanvas.width = width;
    backgroundCanvas.height = height;
    backgroundCanvas.getContext("2d").putImageData(background, 0, 0);
    const motifCanvas = document.createElement("canvas");
    motifCanvas.width = width;
    motifCanvas.height = height;
    motifCanvas.getContext("2d").putImageData(motif, 0, 0);
    context.clearRect(0, 0, width, height);
    context.drawImage(backgroundCanvas, 0, 0);
    context.save();
    context.translate(width * 0.5, height * 0.5);
    const [translateX = 0, translateY = 0] = mutation.translatePixels ?? [];
    context.translate(translateX, translateY);
    context.rotate(THREE.MathUtils.degToRad(mutation.rotationDegrees ?? 0));
    const scale = mutation.scale ?? 1;
    context.scale(scale, scale);
    context.transform(1, 0, mutation.shearX ?? 0, 1, 0, 0);
    context.translate(-width * 0.5, -height * 0.5);
    context.drawImage(motifCanvas, 0, 0);
    context.restore();
  }
  return { canvas, context, width, height };
}

function motifClassification(red, green, blue, x, y, width, height) {
  const inside =
    x >= width * 0.14 &&
    x <= width * 0.46 &&
    y >= height * 0.22 &&
    y <= height * 0.58;
  if (!inside) return null;
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const flower = luminance >= 165 && Math.max(red, green, blue) >= 190;
  const leaf =
    luminance < 165 &&
    green >= red * 1.05 &&
    blue >= red * 0.92 &&
    Math.max(red, green, blue) - Math.min(red, green, blue) >= 18;
  const branch =
    luminance <= 130 &&
    !leaf &&
    Math.max(red, green, blue) - Math.min(red, green, blue) >= 10;
  if (flower) return "flower";
  if (leaf) return "leaf";
  if (branch) return "branch";
  return null;
}

function replacePixel(data, offset) {
  data[offset] = DOMINANT_COLOR[0];
  data[offset + 1] = DOMINANT_COLOR[1];
  data[offset + 2] = DOMINANT_COLOR[2];
  data[offset + 3] = 255;
}

function applyPixelOperation(context, width, height, operation) {
  if (!operation) return { operation: null, changedPixelCount: 0 };
  const image = context.getImageData(0, 0, width, height);
  const { data } = image;
  let changedPixelCount = 0;
  if (operation === "flat-dominant-color") {
    for (let offset = 0; offset < data.length; offset += 4) {
      replacePixel(data, offset);
      changedPixelCount += 1;
    }
  } else if (operation === "rotate-rgb-channels") {
    for (let offset = 0; offset < data.length; offset += 4) {
      const red = data[offset];
      data[offset] = data[offset + 2];
      data[offset + 2] = data[offset + 1];
      data[offset + 1] = red;
      changedPixelCount += 1;
    }
  } else {
    const family = operation.match(/^delete-(flower|leaf|branch)-family$/)?.[1];
    const motifOffsets = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const classification = motifClassification(
          data[offset],
          data[offset + 1],
          data[offset + 2],
          x,
          y,
          width,
          height,
        );
        if (classification) motifOffsets.push({ offset, classification });
      }
    }
    const selected = operation === "delete-half-pattern"
      ? motifOffsets.filter((_, index) => index % 2 === 0)
      : family === "branch"
        ? motifOffsets.filter((entry) => entry.classification !== "flower")
        : motifOffsets.filter((entry) => entry.classification === family);
    for (const { offset } of selected) {
      replacePixel(data, offset);
      changedPixelCount += 1;
    }
  }
  context.putImageData(image, 0, 0);
  return { operation, changedPixelCount };
}

function createScenarioMaterial(baseMaterial, mutation) {
  const base = Array.isArray(baseMaterial) ? baseMaterial[0] : baseMaterial;
  if (!base.map?.image) {
    throw new Error("Umbrella Authored Reference requires one base-color map");
  }
  const { canvas, context, width, height } = transformedCanvas(
    base.map.image,
    mutation,
  );
  const rgbFactors = mutation.rgbFactors ?? [1, 1, 1];
  let paletteChangedPixelCount = 0;
  if (rgbFactors.some((factor) => factor !== 1)) {
    const image = context.getImageData(0, 0, width, height);
    for (let offset = 0; offset < image.data.length; offset += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        image.data[offset + channel] = Math.round(
          Math.min(255, image.data[offset + channel] * rgbFactors[channel]),
        );
      }
      paletteChangedPixelCount += 1;
    }
    context.putImageData(image, 0, 0);
  }
  const pixelMutation = applyPixelOperation(
    context,
    width,
    height,
    mutation.pixelOperation,
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "Development-only patterned appearance perturbation";
  texture.colorSpace = base.map.colorSpace;
  texture.flipY = base.map.flipY;
  texture.wrapS = base.map.wrapS;
  texture.wrapT = base.map.wrapT;
  texture.magFilter = base.map.magFilter;
  texture.minFilter = base.map.minFilter;
  texture.generateMipmaps = base.map.generateMipmaps;
  texture.needsUpdate = true;
  const material = base.clone();
  material.map = texture;
  material.needsUpdate = true;
  return {
    material,
    texture,
    metadata: {
      textureDimensions: [width, height],
      translatePixels: mutation.translatePixels ?? [0, 0],
      rotationDegrees: mutation.rotationDegrees ?? 0,
      scale: mutation.scale ?? 1,
      shearX: mutation.shearX ?? 0,
      rgbFactors,
      paletteChangedPixelCount,
      ...pixelMutation,
    },
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

export async function runPatternedAppearanceV2ReferenceCalibration({
  canvas,
  runIndex,
  onProgress = () => {},
}) {
  const contract = patternedAppearanceV2CalibrationContractDefinition();
  onProgress("Loading Umbrella Authored Reference");
  const reference = await loadAuthoredReference("umbrella");
  const replacementRoot = createLocalReferenceClone(reference);
  const replacementMesh = firstMesh(replacementRoot);
  const baseMaterial = replacementMesh.material;
  const manifest = createEvaluationManifest("umbrella", reference.worldBounds);
  const harness = createEvaluationHarness({
    canvas,
    referenceRoot: reference.root,
    replacementRoot,
    manifest,
  });
  try {
    onProgress("Capturing reference appearance");
    const referenceCaptures = await captureSet(harness, "reference");
    const referenceMaterial = materialEvidence(reference.root);
    onProgress("Capturing identity copy");
    const identityCaptures = await captureSet(harness, "replacement");
    const identity = {
      id: "identity-copy",
      comparison: appearanceComparison({
        referenceCaptures,
        replacementCaptures: identityCaptures,
        referenceMaterial,
        replacementMaterial: materialEvidence(replacementRoot),
        manifest,
      }),
    };
    const scenarios = [];
    for (const definition of contract.scenarios) {
      onProgress(`${definition.classification}: ${definition.id}`);
      const scenario = createScenarioMaterial(baseMaterial, definition.mutation);
      replacementMesh.material = scenario.material;
      replacementMesh.updateMatrixWorld(true);
      const captures = await captureSet(harness, "replacement");
      const comparison = appearanceComparison({
        referenceCaptures,
        replacementCaptures: captures,
        referenceMaterial,
        replacementMaterial: materialEvidence(replacementRoot),
        manifest,
      });
      scenarios.push({
        ...definition,
        mutationEvidence: scenario.metadata,
        aggregate: comparison.aggregate,
        perView: comparison.perView,
        captureChecksums: comparison.captureChecksums,
      });
      replacementMesh.material = baseMaterial;
      scenario.material.dispose();
      scenario.texture.dispose();
    }
    return {
      schemaVersion: "patterned-appearance-v2-reference-run-v1",
      artifactRole: "development-only-authored-reference-calibration",
      productionUse: "prohibited",
      candidateUse: "prohibited",
      objectId: "umbrella",
      runIndex,
      evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
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
    cleanupRoot(reference.root);
    cleanupRoot(replacementRoot);
  }
}
