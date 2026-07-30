import assert from "node:assert/strict";
import test from "node:test";

import { createReferenceObservationContract } from "../tools/reference/reference-observation-contract.mjs";
import {
  compareObservationAppearance,
  createCrossHostObservationContract,
  describeNormativeHost,
  differenceHashBitLength,
  validateCrossHostObservationContract,
  verifyCrossHostObservation,
} from "../tools/reference/normative-hosts.mjs";

const MACOS_ENVIRONMENT = {
  browser: {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/150.0.0.0 Safari/537.36",
    userAgentData: {
      brands: [
        { brand: "Not;A=Brand", version: "8" },
        { brand: "Chromium", version: "150" },
        { brand: "Google Chrome", version: "150" },
      ],
      mobile: false,
      platform: "macOS",
    },
  },
  os: { platform: "MacIntel", userAgentPlatform: "macOS" },
  gpu: {
    vendor: "Google Inc. (Google)",
    renderer:
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)",
    webglVersion: "WebGL 2.0 (OpenGL ES 3.0 Chromium)",
    acceleration: "software",
  },
  color: { colorGamut: "srgb", drawingBufferColorSpace: "srgb" },
  threeRevision: "170",
};

const WINDOWS_ENVIRONMENT = {
  browser: {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0",
    userAgentData: {
      brands: [
        { brand: "Not;A=Brand", version: "8" },
        { brand: "Chromium", version: "150" },
        { brand: "Microsoft Edge", version: "150" },
      ],
      mobile: false,
      platform: "Windows",
    },
  },
  os: { platform: "Win32", userAgentPlatform: "Windows" },
  gpu: {
    vendor: "Google Inc. (Google)",
    renderer:
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
    webglVersion: "WebGL 2.0 (OpenGL ES 3.0 Chromium)",
    acceleration: "software",
  },
  color: { colorGamut: "srgb", drawingBufferColorSpace: "srgb" },
  threeRevision: "170",
};

const STATE_DIGESTS = {
  structure: "structure-digest",
  transforms: "transforms-digest",
  geometry: "geometry-digest",
  materials: "materials-digest",
  lights: "lights-digest",
  renderer: "renderer-digest",
  dynamic: "dynamic-digest",
};

function appearanceFromBits(bits, overrides = {}) {
  let differenceHash = "";
  for (let index = 0; index < bits.length; index += 4) {
    differenceHash += Number.parseInt(bits.slice(index, index + 4), 2).toString(16);
  }
  return {
    channelMeans: [169.5, 177, 167.8],
    channelStandardDeviations: [51.2, 44.9, 58.3],
    normalizedHistograms: Array.from({ length: 3 }, () => Array(16).fill(1 / 16)),
    differenceHash,
    ...overrides,
  };
}

function flipBits(bits, count) {
  const flipped = bits.split("");
  for (let index = 0; index < count; index += 1) {
    const position = (index * 37) % flipped.length;
    flipped[position] = flipped[position] === "1" ? "0" : "1";
  }
  return flipped.join("");
}

const BASE_BITS = Array.from({ length: differenceHashBitLength() }, (_unused, index) =>
  index % 3 === 0 ? "1" : "0",
).join("");

test("normative hosts are identified by OS, browser, and rasterizer backend", () => {
  const macos = describeNormativeHost(MACOS_ENVIRONMENT);
  const windows = describeNormativeHost(WINDOWS_ENVIRONMENT);

  assert.equal(macos.hostKey, "macos-chrome-150-swiftshader-llvm-10-0-0");
  assert.equal(windows.hostKey, "windows-edge-150-swiftshader-subzero");
  assert.equal(macos.acceleration, "software");
  assert.equal(windows.rasterizerBackend, "Subzero");
  assert.notEqual(macos.hostKey, windows.hostKey);
  assert.equal(describeNormativeHost(MACOS_ENVIRONMENT).hostKey, macos.hostKey);
});

test("the cross-host contract is separately versioned and never loosens same-host bounds", () => {
  const { repeatability } = createReferenceObservationContract();
  const crossHost = createCrossHostObservationContract();

  assert.equal(crossHost.schemaVersion, "cross-host-observation-contract-v1");
  assert.deepEqual(
    validateCrossHostObservationContract(crossHost, repeatability.appearance),
    [],
  );
  assert.equal(Object.isFrozen(crossHost), true);
  assert.equal(crossHost.structuralDigests, "exact");
  assert.equal(crossHost.renderContract, "exact");
  for (const metric of [
    "maximumMeanChannelDelta",
    "maximumStandardDeviationDelta",
    "maximumHistogramL1Distance",
  ]) {
    assert.equal(
      crossHost.appearance[metric],
      repeatability.appearance[metric],
      `${metric} must stay at its same-host value across hosts`,
    );
  }
  assert.ok(
    crossHost.appearance.maximumDifferenceHashDistance >
      repeatability.appearance.maximumDifferenceHashDistance,
    "only the perceptual hash may widen for a different rasterizer backend",
  );
  assert.ok(
    crossHost.appearance.maximumDifferenceHashDistance <=
      differenceHashBitLength() * 0.05,
    "the cross-host perceptual bound must stay a small fraction of the hash",
  );
});

test("cross-host verification blocks on any structural or render-contract drift", () => {
  const authoritative = {
    environment: MACOS_ENVIRONMENT,
    stateDigests: STATE_DIGESTS,
    renderContractDigest: "render-contract-digest",
    appearance: appearanceFromBits(BASE_BITS),
  };
  const observed = {
    environment: WINDOWS_ENVIRONMENT,
    stateDigests: { ...STATE_DIGESTS },
    renderContractDigest: "render-contract-digest",
    appearance: appearanceFromBits(flipBits(BASE_BITS, 7)),
  };

  assert.deepEqual(
    verifyCrossHostObservation({ authoritative, observed }),
    [],
  );
  assert.ok(
    verifyCrossHostObservation({
      authoritative,
      observed: {
        ...observed,
        stateDigests: { ...STATE_DIGESTS, geometry: "mutated" },
      },
    }).some((error) => error.includes("geometry")),
  );
  assert.ok(
    verifyCrossHostObservation({
      authoritative,
      observed: { ...observed, renderContractDigest: "drifted" },
    }).some((error) => error.includes("render contract")),
  );
});

test("the cross-host perceptual bound separates backend drift from appearance damage", () => {
  const crossHost = createCrossHostObservationContract();
  const limit = crossHost.appearance.maximumDifferenceHashDistance;
  const base = appearanceFromBits(BASE_BITS);
  const backendDrift = appearanceFromBits(flipBits(BASE_BITS, 7));
  const damaged = appearanceFromBits(flipBits(BASE_BITS, 96), {
    channelMeans: [151.2, 160.4, 149.9],
  });

  assert.ok(
    compareObservationAppearance(base, backendDrift).maximumDifferenceHashDistance <=
      limit,
    "measured rasterizer-backend drift must remain inside the cross-host bound",
  );
  assert.ok(
    compareObservationAppearance(base, damaged).maximumDifferenceHashDistance > limit,
    "declared appearance damage must exceed the cross-host bound",
  );
  assert.ok(
    compareObservationAppearance(base, damaged).maximumMeanChannelDelta >
      crossHost.appearance.maximumMeanChannelDelta,
    "declared appearance damage must also exceed the unchanged mean-channel bound",
  );
});

test("an unregistered host cannot silently inherit the authoritative profile", () => {
  const authoritative = {
    environment: MACOS_ENVIRONMENT,
    stateDigests: STATE_DIGESTS,
    renderContractDigest: "render-contract-digest",
    appearance: appearanceFromBits(BASE_BITS),
  };
  const hardwareGpu = {
    ...WINDOWS_ENVIRONMENT,
    gpu: {
      ...WINDOWS_ENVIRONMENT.gpu,
      renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Direct3D11 vs_5_0 ps_5_0, D3D11)",
      acceleration: "hardware",
    },
  };

  assert.notEqual(
    describeNormativeHost(hardwareGpu).hostKey,
    describeNormativeHost(WINDOWS_ENVIRONMENT).hostKey,
  );
  assert.ok(
    verifyCrossHostObservation({
      authoritative,
      observed: {
        environment: hardwareGpu,
        stateDigests: STATE_DIGESTS,
        renderContractDigest: "render-contract-digest",
        appearance: appearanceFromBits(BASE_BITS),
      },
      registeredHostKeys: [describeNormativeHost(WINDOWS_ENVIRONMENT).hostKey],
    }).some((error) => error.includes("not a registered normative host")),
  );
});
