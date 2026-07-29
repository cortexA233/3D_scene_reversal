import { deepFreeze } from "./reference-value.mjs";

const CONTRACT = {
  schemaVersion: "reference-observation-contract-v1",
  authority: "Assembled Authored Scene",
  reference: {
    pagePath: "/authored-reference.html",
    sourcePath: "gt_designer/main.js",
    sourceSha256:
      "d950434dd62ad46f63779153f4da467803c1c5549b71b77c34194ddf4bf98b72",
    urlOptions: {
      cam: "1",
      campos: "390,190,410,80,26,-20",
      grain: "0",
    },
  },
  sceneAnchor: [86, 26, -24],
  cameras: {
    authoredOverview: {
      position: [390, 190, 410],
      target: [80, 26, -20],
      verticalFovDegrees: 58,
      near: 0.5,
      far: 30000,
    },
  },
  capture: {
    cssViewport: [1440, 810],
    framebuffer: [1440, 810],
    deviceScaleFactor: 1,
    threeRevision: "170",
  },
  clock: {
    kind: "Frozen Observation Clock",
    primaryMomentMs: 12000,
    dynamicMomentsMs: [16000, 24000],
    maximumDynamicMoments: 2,
  },
  repeatability: {
    independentRuns: 2,
    structuralDigests: "exact",
    primaryCapturePngSha256: "diagnostic",
    appearance: {
      maximumMeanChannelDelta: 0.15,
      maximumStandardDeviationDelta: 0.2,
      maximumHistogramL1Distance: 0.002,
      maximumDifferenceHashDistance: 4,
    },
  },
  renderContract: {
    schemaVersion: "scene-render-contract-v1",
    renderer: {
      antialias: true,
      powerPreference: "high-performance",
      pixelRatio: 1,
      toneMapping: "ACESFilmicToneMapping",
      exposure: 1,
      outputColorSpace: "SRGBColorSpace",
    },
    shadows: {
      enabled: true,
      type: "PCFSoftShadowMap",
      sunMapSize: [4096, 4096],
      sunBias: -0.0004,
    },
    globalLights: {
      sun: {
        elevationDegrees: 23,
        azimuthDegrees: 60,
        color: 0xffce86,
        intensity: 2.7,
        castShadow: true,
      },
      hemisphere: {
        sky: 0xcfe2f0,
        ground: 0xc6b06a,
        intensity: 1.12,
      },
      ambient: { color: 0xfff0d6, intensity: 0.34 },
    },
    localLights: {
      sourcePath: "gt_designer/data/lighting.json",
      sourceSchema: "island-lighting-v1",
      sourceCount: 33,
      runtimeCount: 32,
      sourceIntensityScale: 1.5,
      intensityMultiplier: 3,
    },
    fog: { kind: "Fog", color: 0xe6dcc2, near: 650, far: 3500 },
    sky: {
      kind: "gradient",
      zenith: 0x3f7ec8,
      horizon: 0xaccfe6,
    },
    ocean: {
      y: 16,
      color: 0x4fb7b8,
      sunColor: 0xfff0cf,
      distortion: 1.6,
      alpha: 0.92,
      normalMapUrl:
        "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/textures/waternormals.jpg",
    },
    clouds: { enabled: true, count: 34 },
    urlOptions: {
      cameraControlsDisabled: true,
      pavingVariant: 0,
      boulders: 0,
      rocks: 900,
      pebbles: 4200,
      shrubs: 0,
      lanternMultiplier: 3,
    },
    postprocessing: {
      passes: ["RenderPass", "UnrealBloomPass", "ShaderPass", "OutputPass"],
      bloom: { enabled: true, strength: 0.26, radius: 0.7, threshold: 0.9 },
      grading: { enabled: true, warmMix: 0.6, gamma: 0.96 },
      vignette: { enabled: true, amount: 0.34 },
      filmGrain: { enabled: false, configuredAmount: 0.045, runtimeAmount: 0 },
    },
  },
};

deepFreeze(CONTRACT);

export function createReferenceObservationContract() {
  return CONTRACT;
}

export function validateReferenceObservationContract(contract) {
  const errors = [];
  if (contract?.schemaVersion !== "reference-observation-contract-v1") {
    errors.push("schemaVersion must be reference-observation-contract-v1");
  }
  if (contract?.authority !== "Assembled Authored Scene") {
    errors.push("authority must be Assembled Authored Scene");
  }
  if (JSON.stringify(contract?.sceneAnchor) !== JSON.stringify([86, 26, -24])) {
    errors.push("sceneAnchor must be [86,26,-24]");
  }
  const overview = contract?.cameras?.authoredOverview;
  if (
    JSON.stringify(overview?.position) !== JSON.stringify([390, 190, 410]) ||
    JSON.stringify(overview?.target) !== JSON.stringify([80, 26, -20]) ||
    overview?.verticalFovDegrees !== 58 ||
    overview?.near !== 0.5 ||
    overview?.far !== 30000
  ) {
    errors.push("authored overview camera does not match its frozen values");
  }
  const capture = contract?.capture;
  if (
    JSON.stringify(capture?.cssViewport) !== JSON.stringify([1440, 810]) ||
    JSON.stringify(capture?.framebuffer) !== JSON.stringify([1440, 810]) ||
    capture?.deviceScaleFactor !== 1 ||
    capture?.threeRevision !== "170"
  ) {
    errors.push("capture must use 1440x810, DSF 1, and Three.js r170");
  }
  if (
    contract?.clock?.kind !== "Frozen Observation Clock" ||
    contract.clock.primaryMomentMs !== 12000 ||
    contract.clock.dynamicMomentsMs?.length >
      contract.clock.maximumDynamicMoments
  ) {
    errors.push("Frozen Observation Clock moments are invalid");
  }
  if (contract?.renderContract?.schemaVersion !== "scene-render-contract-v1") {
    errors.push("Scene Render Contract v1 is missing");
  }
  return errors;
}
