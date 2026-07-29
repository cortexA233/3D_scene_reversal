import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import {
  createReferenceObservationContract,
  validateReferenceObservationContract,
} from "../tools/reference/reference-observation-contract.mjs";
import {
  ReferenceMutationError,
  createReferenceAccess,
} from "../tools/reference/reference-access.mjs";
import { createFrozenObservationClockPreload } from "../tools/reference/frozen-observation-clock.mjs";
import { deriveReferenceCameraSet } from "../tools/reference/reference-cameras.mjs";
import { verifySceneRenderContractSource } from "../tools/reference/scene-render-contract-source.mjs";
import { verifySceneRenderContractRuntime } from "../tools/reference/scene-render-contract-runtime.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("Reference Observation v1 freezes its public capture conditions", () => {
  const contract = createReferenceObservationContract();

  assert.equal(contract.schemaVersion, "reference-observation-contract-v1");
  assert.equal(contract.authority, "Assembled Authored Scene");
  assert.deepEqual(contract.sceneAnchor, [86, 26, -24]);
  assert.deepEqual(contract.cameras.authoredOverview, {
    position: [390, 190, 410],
    target: [80, 26, -20],
    verticalFovDegrees: 58,
    near: 0.5,
    far: 30000,
  });
  assert.deepEqual(contract.capture, {
    cssViewport: [1440, 810],
    framebuffer: [1440, 810],
    deviceScaleFactor: 1,
    threeRevision: "170",
  });
  assert.equal(contract.clock.kind, "Frozen Observation Clock");
  assert.equal(contract.clock.primaryMomentMs, 12000);
  assert.deepEqual(contract.clock.dynamicMomentsMs, [16000, 24000]);
  assert.deepEqual(contract.repeatability.appearance, {
    maximumMeanChannelDelta: 0.15,
    maximumStandardDeviationDelta: 0.2,
    maximumHistogramL1Distance: 0.002,
    maximumDifferenceHashDistance: 4,
  });
  assert.deepEqual(validateReferenceObservationContract(contract), []);
  assert.equal(Object.isFrozen(contract), true);
  assert.equal(Object.isFrozen(contract.cameras.authoredOverview), true);
});

test("Reference Access returns read-only evidence when every state summary is stable", async () => {
  const snapshot = () => ({
    structure: { digest: "structure" },
    transforms: { digest: "transforms" },
    geometry: { digest: "geometry" },
    materials: { digest: "materials" },
    lights: { digest: "lights" },
    renderer: { digest: "renderer" },
    dynamic: { digest: "dynamic" },
  });
  const access = createReferenceAccess({ snapshot });

  const evidence = await access.observe(() => ({ meshCount: 12 }));

  assert.deepEqual(evidence.result, { meshCount: 12 });
  assert.equal(evidence.immutability.unchanged, true);
  assert.equal(Object.isFrozen(evidence), true);
  assert.equal(Object.isFrozen(evidence.result), true);
});

test("Reference Access rejects a deliberately mutating adapter", async () => {
  let version = 0;
  const snapshot = () => ({
    structure: { digest: `structure-${version}` },
    transforms: { digest: "transforms" },
    geometry: { digest: "geometry" },
    materials: { digest: "materials" },
    lights: { digest: "lights" },
    renderer: { digest: "renderer" },
    dynamic: { digest: "dynamic" },
  });
  const access = createReferenceAccess({ snapshot });

  await assert.rejects(
    access.observe(() => {
      version += 1;
      return { mutationAttempted: true };
    }),
    (error) =>
      error instanceof ReferenceMutationError &&
      error.changedSummaries.includes("structure"),
  );
});

test("Reference Access permits only declared dynamic transitions", async () => {
  const state = {
    structure: "structure",
    transforms: "transforms-1",
    geometry: "geometry",
    materials: "materials",
    lights: "lights",
    renderer: "renderer",
    dynamic: "dynamic-1",
  };
  const snapshot = () =>
    Object.fromEntries(
      Object.entries(state).map(([name, digest]) => [name, { digest }]),
    );
  const access = createReferenceAccess({ snapshot });

  const evidence = await access.observe(
    () => {
      state.transforms = "transforms-2";
      state.dynamic = "dynamic-2";
      return { momentMs: 16000 };
    },
    { allowedChanges: ["transforms", "dynamic"] },
  );

  assert.deepEqual(evidence.immutability.changedSummaries, [
    "transforms",
    "dynamic",
  ]);
  assert.deepEqual(evidence.immutability.allowedChanges, [
    "transforms",
    "dynamic",
  ]);
  state.structure = "structure-2";
  await assert.rejects(
    access.observe(
      () => {
        state.structure = "structure-3";
      },
      { allowedChanges: ["transforms", "dynamic"] },
    ),
    ReferenceMutationError,
  );
});

test("Frozen Observation Clock is injected externally and permits only declared moments", () => {
  const sandbox = {
    performance: { now: () => 7 },
    Date: class extends Date {},
  };
  vm.runInNewContext(
    createFrozenObservationClockPreload({
      primaryMomentMs: 12000,
      dynamicMomentsMs: [16000, 24000],
    }),
    sandbox,
  );

  assert.equal(sandbox.performance.now(), 12000);
  assert.equal(sandbox.__frozenObservationClock.momentMs, 12000);
  sandbox.__frozenObservationClock.setMoment(16000);
  assert.equal(sandbox.performance.now(), 16000);
  assert.throws(
    () => sandbox.__frozenObservationClock.setMoment(20000),
    /undeclared observation moment/,
  );
});

test("auxiliary cameras are derived from reference bounds around the Scene Anchor", () => {
  const cameraSet = deriveReferenceCameraSet({
    authoredBounds: {
      min: [-220, 20, -260],
      max: [360, 190, 250],
    },
    sceneAnchor: [86, 26, -24],
    aspect: 16 / 9,
    verticalFovDegrees: 58,
    near: 0.5,
    far: 30000,
  });

  assert.equal(cameraSet.framingBasis, "reference-authored-bounds");
  assert.deepEqual(cameraSet.topDown.target, [86, 26, -24]);
  assert.equal(cameraSet.topDown.position[0], 86);
  assert.equal(cameraSet.topDown.position[2], -24);
  assert.deepEqual(Object.keys(cameraSet.obliques), ["north", "east", "south", "west"]);
  assert.equal(
    cameraSet.obliques.north.position[2] +
      cameraSet.obliques.south.position[2],
    cameraSet.obliques.north.target[2] * 2,
  );
  assert.equal(
    cameraSet.obliques.east.position[0] +
      cameraSet.obliques.west.position[0],
    cameraSet.obliques.east.target[0] * 2,
  );
  for (const camera of [cameraSet.topDown, ...Object.values(cameraSet.obliques)]) {
    assert.equal(camera.viewMatrix.length, 16);
    assert.equal(camera.projectionMatrix.length, 16);
    assert.ok(camera.viewMatrix.every(Number.isFinite));
    assert.ok(camera.projectionMatrix.every(Number.isFinite));
  }
});

test("Scene Render Contract v1 is machine-verified against reference source", async () => {
  const contract = createReferenceObservationContract();
  const [source, localLights] = await Promise.all([
    readFile(path.join(PROJECT_ROOT, contract.reference.sourcePath), "utf8"),
    readFile(
      path.join(PROJECT_ROOT, contract.renderContract.localLights.sourcePath),
      "utf8",
    ).then(JSON.parse),
  ]);

  assert.deepEqual(
    verifySceneRenderContractSource({ source, localLights, contract }),
    [],
  );
  assert.ok(
    verifySceneRenderContractSource({
      source: source.replace("exposure: 1.0", "exposure: 2.0"),
      localLights,
      contract,
    }).includes("renderer exposure"),
  );
});

test("Scene Render Contract v1 rejects runtime renderer or composer drift", () => {
  const contract = createReferenceObservationContract();
  const runtime = {
    capture: {
      cssViewport: [1440, 810],
      framebuffer: [1440, 810],
      deviceScaleFactor: 1,
      contextAttributes: { antialias: true, powerPreference: "high-performance" },
      fog: { type: "Fog", color: "e6dcc2", near: 650, far: 3500 },
    },
    threeRenderer: {
      toneMapping: "ACESFilmicToneMapping",
      exposure: 1,
      outputColorSpace: "SRGBColorSpace",
      pixelRatio: 1,
      shadows: { enabled: true, type: "PCFSoftShadowMap" },
    },
    composer: {
      passes: ["RenderPass", "UnrealBloomPass", "ShaderPass", "OutputPass"],
      bloom: { strength: 0.26, radius: 0.7, threshold: 0.9 },
      grading: { amount: 0, vignette: 0.34 },
    },
    environment: {
      globalLights: {
        sun: {
          color: 0xffce86,
          intensity: 2.7,
          castShadow: true,
          shadowMapSize: [4096, 4096],
          shadowBias: -0.0004,
        },
        hemisphere: {
          sky: 0xcfe2f0,
          ground: 0xc6b06a,
          intensity: 1.12,
        },
        ambient: { color: 0xfff0d6, intensity: 0.34 },
      },
      localLightCount: 32,
      sky: { kind: "gradient", zenith: 0x3f7ec8, horizon: 0xaccfe6 },
      ocean: {
        y: 16,
        color: 0x4fb7b8,
        sunColor: 0xfff0cf,
        distortion: 1.6,
        alpha: 0.92,
      },
      cloudCount: 34,
    },
    urlOptions: { cam: "1", campos: "390,190,410,80,26,-20", grain: "0" },
  };

  assert.deepEqual(verifySceneRenderContractRuntime({ runtime, contract }), []);
  assert.ok(
    verifySceneRenderContractRuntime({
      runtime: {
        ...runtime,
        threeRenderer: { ...runtime.threeRenderer, exposure: 1.1 },
      },
      contract,
    }).includes("renderer exposure"),
  );
});
