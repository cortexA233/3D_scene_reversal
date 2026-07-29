export const EVALUATION_PROTOCOL_VERSION = "single-mesh-evaluation-v1";
export const CAPTURE_SIZE = 512;
export const CAMERA_FOV_DEGREES = 38;
export const CANONICAL_MAX_DIMENSION = 7;
export const FRAMING_MARGIN = 1.1;

function freezeRecords(records) {
  return Object.freeze(records.map((record) => Object.freeze(record)));
}

export const EVALUATION_VIEWS = freezeRecords([
  ...Array.from({ length: 8 }, (_, index) => ({
    id: `low-${String(index * 45).padStart(3, "0")}`,
    elevationDegrees: 20,
    azimuthDegrees: index * 45,
  })),
  ...[45, 135, 225, 315].map((azimuthDegrees) => ({
    id: `high-${String(azimuthDegrees).padStart(3, "0")}`,
    elevationDegrees: 60,
    azimuthDegrees,
  })),
]);

export const EVALUATION_PASSES = freezeRecords([
  {
    id: "neutral-rgb",
    label: "Neutral RGB",
    encoding: "sRGB display color under frozen lights",
  },
  {
    id: "silhouette",
    label: "Silhouette",
    encoding: "white foreground on black background",
  },
  {
    id: "linear-depth",
    label: "Linear Depth",
    encoding: "RGB=(viewDistance-near)/(far-near); white background",
  },
  {
    id: "world-normal",
    label: "World Normal",
    encoding: "RGB=normalize(worldNormal)*0.5+0.5; black background",
  },
  {
    id: "semantic-id",
    label: "Semantic ID",
    encoding: "stable 24-bit semantic color; black background",
  },
  {
    id: "albedo",
    label: "Unlit Albedo",
    encoding: "sRGB base color and base-color map without lighting",
  },
  {
    id: "lit-rgb",
    label: "Frozen-lighting RGB",
    encoding: "sRGB authored/procedural material under frozen lights",
  },
]);

function requireVector3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} must be a three-number array`);
  }
  for (const component of value) {
    if (!Number.isFinite(component)) {
      throw new TypeError(`${label} components must be finite`);
    }
  }
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

export function cameraDirection(view) {
  const elevation = degreesToRadians(view.elevationDegrees);
  const azimuth = degreesToRadians(view.azimuthDegrees);
  const horizontal = Math.cos(elevation);
  return [
    Math.sin(azimuth) * horizontal,
    Math.sin(elevation),
    Math.cos(azimuth) * horizontal,
  ];
}

/**
 * Build every comparison transform and camera scalar from the Authored
 * Reference bounds. A replacement is intentionally not accepted as input.
 */
export function deriveReferenceFraming(referenceWorldBounds) {
  const { min, max } = referenceWorldBounds;
  requireVector3(min, "referenceWorldBounds.min");
  requireVector3(max, "referenceWorldBounds.max");
  const size = max.map((value, axis) => value - min[axis]);
  if (size.some((value) => value <= 0)) {
    throw new RangeError("reference bounds must have three positive dimensions");
  }

  const bottomCenter = [
    (min[0] + max[0]) * 0.5,
    min[1],
    (min[2] + max[2]) * 0.5,
  ];
  const largestDimension = Math.max(...size);
  const canonicalScale = CANONICAL_MAX_DIMENSION / largestDimension;
  const canonicalSize = size.map((value) => value * canonicalScale);
  const canonicalBounds = {
    min: [-canonicalSize[0] * 0.5, 0, -canonicalSize[2] * 0.5],
    max: [
      canonicalSize[0] * 0.5,
      canonicalSize[1],
      canonicalSize[2] * 0.5,
    ],
    size: canonicalSize,
  };
  const target = [0, canonicalSize[1] * 0.5, 0];
  const boundingSphereRadius = Math.hypot(...canonicalSize) * 0.5;
  const distance =
    (boundingSphereRadius /
      Math.sin(degreesToRadians(CAMERA_FOV_DEGREES * 0.5))) *
    FRAMING_MARGIN;
  const near = Math.max(0.01, distance - boundingSphereRadius * 1.25);
  const far = distance + boundingSphereRadius * 1.25;

  return {
    sourceWorldBounds: { min: [...min], max: [...max], size },
    reconstructionFrame: {
      sourceWorldBottomCenter: bottomCenter,
      sourceWorldAxesPreserved: true,
    },
    referenceTransform: {
      translationBeforeScale: bottomCenter.map((value) => -value),
      uniformScale: canonicalScale,
    },
    replacementTransform: {
      translationBeforeScale: [0, 0, 0],
      uniformScale: canonicalScale,
      independentlyFramed: false,
    },
    canonicalBounds,
    camera: {
      fovDegrees: CAMERA_FOV_DEGREES,
      target,
      boundingSphereRadius,
      distance,
      near,
      far,
      framingMargin: FRAMING_MARGIN,
    },
  };
}

export function cameraPose(view, framing) {
  const direction = cameraDirection(view);
  const { target, distance, near, far } = framing.camera;
  return {
    id: view.id,
    elevationDegrees: view.elevationDegrees,
    azimuthDegrees: view.azimuthDegrees,
    position: target.map(
      (component, axis) => component + direction[axis] * distance,
    ),
    target: [...target],
    up: [0, 1, 0],
    fovDegrees: CAMERA_FOV_DEGREES,
    near,
    far,
  };
}

export function createEvaluationManifest(unitId, referenceWorldBounds) {
  if (typeof unitId !== "string" || unitId.trim() === "") {
    throw new TypeError("unitId must be a non-empty string");
  }
  const framing = deriveReferenceFraming(referenceWorldBounds);
  return {
    schemaVersion: EVALUATION_PROTOCOL_VERSION,
    artifactRole: "development-only-evaluation-manifest",
    unitId,
    capture: {
      width: CAPTURE_SIZE,
      height: CAPTURE_SIZE,
      pixelOrigin: "bottom-left",
      channels: "RGBA8",
    },
    renderer: {
      threeRevision: "170",
      toneMapping: "ACESFilmic",
      toneMappingExposure: 1.05,
      outputColorSpace: "sRGB for color passes; linear RGBA8 for data passes",
      lighting: "frozen hemisphere plus directional key",
    },
    framing,
    views: EVALUATION_VIEWS.map((view) => cameraPose(view, framing)),
    passes: EVALUATION_PASSES.map((pass) => ({ ...pass })),
    captures: [],
  };
}
