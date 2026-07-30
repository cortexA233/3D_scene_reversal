/**
 * Normative observation hosts.
 *
 * The Assembled Authored Scene is identical on every machine, but a headless
 * browser's software rasterizer is not: the same SwiftShader release ships an
 * LLVM backend on one platform and the Subzero backend on another, and their
 * gradient rounding differs by a fraction of a code value. That moves a
 * perceptual difference hash without moving the reference.
 *
 * A normative host is therefore identified by OS, browser, and rasterizer
 * backend. Structural, geometric, material, light, renderer, and render-contract
 * evidence must stay byte-identical across hosts; only the native appearance
 * metrics carry a separately declared cross-host envelope.
 */

import { deepFreeze } from "./reference-value.mjs";

const DIFFERENCE_HASH_COLUMNS = 33;
const DIFFERENCE_HASH_ROWS = 18;

export function differenceHashBitLength() {
  return (DIFFERENCE_HASH_COLUMNS - 1) * DIFFERENCE_HASH_ROWS;
}

/**
 * Separately versioned so `reference-observation-contract-v1` and the frozen
 * authoritative evidence it produced stay untouched. Everything the Assembled
 * Authored Scene determines is required to be exact; the three quantitative
 * appearance bounds keep their same-host values, and only the perceptual hash
 * widens to absorb rasterizer-backend rounding.
 */
const CROSS_HOST_CONTRACT = {
  schemaVersion: "cross-host-observation-contract-v1",
  structuralDigests: "exact",
  renderContract: "exact",
  cameraSet: "exact",
  sceneEvidence: "exact",
  appearance: {
    maximumMeanChannelDelta: 0.15,
    maximumStandardDeviationDelta: 0.2,
    maximumHistogramL1Distance: 0.002,
    // 16 of 576 bits. Measured backend drift is 7; a declared appearance
    // change moves an order of magnitude more (see the calibration control in
    // test/normative-observation-host.test.mjs).
    maximumDifferenceHashDistance: 16,
  },
};

deepFreeze(CROSS_HOST_CONTRACT);

export function createCrossHostObservationContract() {
  return CROSS_HOST_CONTRACT;
}

export function validateCrossHostObservationContract(crossHost, sameHostAppearance) {
  const errors = [];
  if (crossHost?.schemaVersion !== "cross-host-observation-contract-v1") {
    errors.push("schemaVersion must be cross-host-observation-contract-v1");
  }
  for (const field of ["structuralDigests", "renderContract", "cameraSet", "sceneEvidence"]) {
    if (crossHost?.[field] !== "exact") {
      errors.push(`cross-host ${field} evidence must be exact`);
    }
  }
  for (const metric of [
    "maximumMeanChannelDelta",
    "maximumStandardDeviationDelta",
    "maximumHistogramL1Distance",
  ]) {
    if (crossHost?.appearance?.[metric] !== sameHostAppearance?.[metric]) {
      errors.push(`cross-host ${metric} must equal its same-host value`);
    }
  }
  if (
    !(
      crossHost?.appearance?.maximumDifferenceHashDistance >
      sameHostAppearance?.maximumDifferenceHashDistance
    ) ||
    crossHost.appearance.maximumDifferenceHashDistance > differenceHashBitLength() * 0.05
  ) {
    errors.push(
      "the cross-host perceptual bound must widen the same-host value while staying a small fraction of the hash",
    );
  }
  return errors;
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function osName(environment) {
  const platform = environment?.os?.userAgentPlatform ?? environment?.os?.platform ?? "";
  if (/mac/i.test(platform)) return "macos";
  if (/win/i.test(platform)) return "windows";
  if (/linux|x11|cros/i.test(platform)) return "linux";
  return slug(platform) || "unknown-os";
}

function browserName(environment) {
  const brands = environment?.browser?.userAgentData?.brands ?? [];
  const branded = brands.find(
    ({ brand }) => !/not.*a.*brand/i.test(brand) && !/^chromium$/i.test(brand),
  );
  const fallback = brands.find(({ brand }) => /^chromium$/i.test(brand));
  const chosen = branded ?? fallback;
  if (!chosen) return "unknown-browser";
  const name = slug(chosen.brand)
    .replace(/^google-/, "")
    .replace(/^microsoft-/, "");
  return `${name}-${slug(chosen.version)}`;
}

/**
 * SwiftShader reports its JIT backend inside the ANGLE renderer string, e.g.
 * `SwiftShader Device (Subzero)` or `SwiftShader Device (LLVM 10.0.0)`.
 */
export function rasterizerBackend(environment) {
  const renderer = environment?.gpu?.renderer ?? "";
  const swiftshader = renderer.match(/SwiftShader Device \(([^)]+?)\)/i);
  if (swiftshader) return swiftshader[1].trim();
  const angle = renderer.match(/^ANGLE \(([^,]+),\s*([^,]+)/);
  if (angle) return angle[2].trim();
  return renderer.trim() || "unknown-rasterizer";
}

function rasterizerSlug(environment) {
  const renderer = environment?.gpu?.renderer ?? "";
  const backend = slug(rasterizerBackend(environment));
  return /swiftshader/i.test(renderer) ? `swiftshader-${backend}` : backend;
}

export function describeNormativeHost(environment) {
  return Object.freeze({
    hostKey: `${osName(environment)}-${browserName(environment)}-${rasterizerSlug(environment)}`,
    os: osName(environment),
    browser: browserName(environment),
    rasterizerBackend: rasterizerBackend(environment),
    acceleration: environment?.gpu?.acceleration ?? "unknown",
    threeRevision: environment?.threeRevision ?? null,
  });
}

function maximumAbsoluteDelta(left, right) {
  return Math.max(...left.map((value, index) => Math.abs(value - right[index])));
}

function histogramL1Distance(left, right) {
  return Math.max(
    ...left.map((bins, channel) =>
      bins.reduce(
        (sum, value, index) => sum + Math.abs(value - right[channel][index]),
        0,
      ),
    ),
  );
}

export function differenceHashDistance(left, right) {
  if (left.length !== right.length) {
    throw new Error("appearance difference hashes have different lengths");
  }
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    let xor = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

export function compareObservationAppearance(left, right) {
  return {
    maximumMeanChannelDelta: maximumAbsoluteDelta(left.channelMeans, right.channelMeans),
    maximumStandardDeviationDelta: maximumAbsoluteDelta(
      left.channelStandardDeviations,
      right.channelStandardDeviations,
    ),
    maximumHistogramL1Distance: histogramL1Distance(
      left.normalizedHistograms,
      right.normalizedHistograms,
    ),
    maximumDifferenceHashDistance: differenceHashDistance(
      left.differenceHash,
      right.differenceHash,
    ),
  };
}

export function appearanceEnvelopeErrors(deltas, envelope, label) {
  return Object.entries(envelope)
    .filter(([metric, limit]) => deltas[metric] > limit)
    .map(
      ([metric, limit]) =>
        `${label}: ${metric} ${deltas[metric]} exceeds the declared bound ${limit}`,
    );
}

/**
 * Compares a freshly observed host against the authoritative frozen profile.
 * `registeredHostKeys`, when supplied, restricts which hosts may observe at all
 * so an unrecorded machine cannot quietly adopt the authoritative evidence.
 */
export function verifyCrossHostObservation({
  authoritative,
  observed,
  crossHost = CROSS_HOST_CONTRACT,
  registeredHostKeys = null,
}) {
  const errors = [];
  const observedHost = describeNormativeHost(observed.environment);
  const authoritativeHost = describeNormativeHost(authoritative.environment);

  if (registeredHostKeys && !registeredHostKeys.includes(observedHost.hostKey)) {
    errors.push(
      `${observedHost.hostKey} is not a registered normative host; record its profile before using it for blocking evidence`,
    );
  }
  if (observedHost.threeRevision !== authoritativeHost.threeRevision) {
    errors.push(
      `Three.js revision ${observedHost.threeRevision} does not match the authoritative ${authoritativeHost.threeRevision}`,
    );
  }
  if (crossHost.structuralDigests === "exact") {
    for (const [name, digest] of Object.entries(authoritative.stateDigests)) {
      if (observed.stateDigests?.[name] !== digest) {
        errors.push(
          `${name} state digest differs from the authoritative profile; the Assembled Authored Scene must be identical on every normative host`,
        );
      }
    }
  }
  if (
    crossHost.renderContract === "exact" &&
    observed.renderContractDigest !== authoritative.renderContractDigest
  ) {
    errors.push(
      "render contract digest differs from the authoritative profile",
    );
  }
  errors.push(
    ...appearanceEnvelopeErrors(
      compareObservationAppearance(authoritative.appearance, observed.appearance),
      crossHost.appearance,
      `${observedHost.hostKey} versus ${authoritativeHost.hostKey} native appearance`,
    ),
  );
  return errors;
}
