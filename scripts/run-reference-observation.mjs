import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";
import { createFrozenObservationClockPreload } from "../tools/reference/frozen-observation-clock.mjs";
import {
  createReferenceObservationContract,
  validateReferenceObservationContract,
} from "../tools/reference/reference-observation-contract.mjs";
import {
  createCrossHostObservationContract,
  describeNormativeHost,
  validateCrossHostObservationContract,
  verifyCrossHostObservation,
} from "../tools/reference/normative-hosts.mjs";
import { verifySceneRenderContractSource } from "../tools/reference/scene-render-contract-source.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CAMERA_SET_PATH = path.join(
  PROJECT_ROOT,
  "tools/reference/baselines/reference-camera-set-v2.json",
);
const EVIDENCE_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence/reference-observation-v1.json",
);
const HOST_EVIDENCE_DIRECTORY = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence/hosts",
);
const checkOnly = process.argv.includes("--check");
const contract = createReferenceObservationContract();
const crossHostContract = createCrossHostObservationContract();
// Migrated from macos-chrome-150-swiftshader-llvm-10-0-0 by ADR-0050, because
// ADR-0049's camera-set migration must be re-frozen by the authoritative host
// and no macOS host is available. The superseded profiles are preserved under
// evidence/superseded/. Only an ADR may change this constant.
const AUTHORITATIVE_HOST_KEY = "windows-edge-150-swiftshader-subzero";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function roundedDirection(position, target) {
  const direction = target.map((value, index) => value - position[index]);
  const length = Math.hypot(...direction);
  return direction.map((value) => Number((value / length).toFixed(9)));
}

function assertVectorClose(actual, expected, label, epsilon = 1e-8) {
  assert.equal(actual.length, expected.length, `${label} dimension`);
  actual.forEach((value, index) => {
    assert.ok(
      Math.abs(value - expected[index]) <= epsilon,
      `${label}[${index}] expected ${expected[index]}, received ${value}`,
    );
  });
}

function summaryDigests(snapshot) {
  return Object.fromEntries(
    Object.entries(snapshot).map(([name, summary]) => [name, summary.digest]),
  );
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

function differenceHashDistance(left, right) {
  assert.equal(left.length, right.length, "appearance difference hash length");
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

function compareAppearance(left, right) {
  return {
    maximumMeanChannelDelta: maximumAbsoluteDelta(
      left.channelMeans,
      right.channelMeans,
    ),
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

function assertAppearanceWithinDeclaredBounds(left, right, label) {
  const deltas = compareAppearance(left, right);
  for (const [metric, limit] of Object.entries(contract.repeatability.appearance)) {
    assert.ok(
      deltas[metric] <= limit,
      `${label}: ${metric} ${deltas[metric]} exceeds declared reference repeatability ${limit}`,
    );
  }
  return deltas;
}

function withoutAppearance(report) {
  const result = structuredClone(report);
  delete result.primary.result.appearance;
  // The dynamic moments render too, and a rendered frame is the one thing two runs on this
  // host do not reproduce bit for bit. Each moment's appearance is held to the declared
  // repeatability envelope separately, below; everything else about a moment — its
  // structural digests and its state transition — still has to match exactly.
  for (const capture of result.dynamicCaptures ?? []) delete capture.appearance;
  return result;
}

function buildCameraSet(report) {
  const observedCamera = report.primary.result.capture.camera;
  return {
    schemaVersion: "reference-camera-set-v2",
    framingBasis: "reference-only assembled authored scene evidence",
    sceneAnchor: contract.sceneAnchor,
    authoredOverview: {
      ...contract.cameras.authoredOverview,
      aspect: observedCamera.aspect,
      up: observedCamera.up,
      viewMatrix: observedCamera.viewMatrix,
      projectionMatrix: observedCamera.projectionMatrix,
    },
    derivationEvidence: {
      authority: contract.authority,
      authoredBounds: report.primary.result.cameraSet.authoredBounds,
      // The auxiliary cameras frame the island rather than the full authored
      // extent, because a standoff that clears the distant backdrop lands
      // outside the reference's own fog. See ADR-0049.
      framingSubject: report.primary.result.cameraSet.framingSubject,
      framingBasis: report.primary.result.cameraSet.framingBasis,
      candidateConsulted: false,
    },
    topDown: report.primary.result.cameraSet.topDown,
    obliques: report.primary.result.cameraSet.obliques,
  };
}

async function observe(runIndex) {
  const query = new URLSearchParams(contract.reference.urlOptions).toString();
  return runLocalSceneAutomation({
    label: `reference-observation-${runIndex}`,
    serverFlag: "--reference-observation",
    path: contract.reference.pagePath,
    query: `?${query}`,
    readyState: { status: "primary-ready" },
    timeoutMs: 120_000,
    port: 8460 + runIndex * 10,
    probeExpression: `(() => {
      const observation = window.referenceObservation;
      return {
        state: observation?.status === "error" ? "error" : null,
        status: observation?.status ?? null,
        statusText: observation?.error ?? null,
      };
    })()`,
    runtimeObjectAttachment: {
      whenState: { status: "awaiting-runtime-render-state" },
      prototypeExpressions: [
        "window.__referenceObservationTypes.WebGLRenderer.prototype",
        "window.__referenceObservationTypes.EffectComposer.prototype",
      ],
      targetExpression: "window.referenceObservation",
      functionDeclaration: `function (renderers, composers) {
        const renderer = Array.from(renderers).find(
          (candidate) => candidate.domElement === document.querySelector("canvas"),
        );
        const composer = Array.from(composers).find(
          (candidate) => candidate.renderer === renderer,
        );
        return this.attachRuntimeRenderState({ renderer, composer });
      }`,
    },
    preloadScript: createFrozenObservationClockPreload(contract.clock),
    viewport: {
      width: contract.capture.cssViewport[0],
      height: contract.capture.cssViewport[1],
      deviceScaleFactor: contract.capture.deviceScaleFactor,
    },
    blockExternalNetwork: false,
    allowedExternalRequestUrls: [contract.renderContract.ocean.normalMapUrl],
    postReadyExpression: "window.referenceObservation.complete()",
  });
}

async function assertFrozenFile(filePath, generated) {
  let existing;
  try {
    existing = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      assert.fail(`${path.relative(PROJECT_ROOT, filePath)} is not frozen; run npm run observe:reference`);
    }
    throw error;
  }
  assert.equal(existing, generated, `${path.relative(PROJECT_ROOT, filePath)} drifted`);
}

async function writeOrCheck(filePath, value) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (checkOnly) await assertFrozenFile(filePath, serialized);
  else {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, serialized);
  }
}

function stableEvidenceProjection(evidence) {
  const result = structuredClone(evidence);
  delete result.appearanceIntegrity.primaryCapturePngSha256;
  delete result.appearanceIntegrity.primaryCaptureByteLength;
  delete result.repeatability.appearanceDeltas;
  // Appearance-derived and therefore not bit-reproducible, like the deltas above.
  delete result.repeatability.dynamicAppearanceDeltas;
  delete result.repeatability.worstDynamicMoment;
  if (result.crossHost) delete result.crossHost.appearanceDeltas;
  for (const run of result.repeatability.independentRuns) {
    delete run.primaryCapturePngSha256;
    delete run.appearance;
  }
  return result;
}

/**
 * Everything the Assembled Authored Scene itself determines. A second normative
 * host must reproduce this exactly; only the host's own environment metadata and
 * its rasterizer-dependent native appearance may differ.
 */
function hostInvariantProjection(evidence) {
  const result = stableEvidenceProjection(evidence);
  delete result.environment;
  delete result.host;
  delete result.crossHost;
  delete result.contract;
  delete result.capture.contextAttributes;
  delete result.appearanceIntegrity.rgbaSha256;
  return result;
}

function canonicalDigest(value) {
  return sha256(JSON.stringify(value));
}

function hostEvidencePath(hostKey) {
  return path.join(HOST_EVIDENCE_DIRECTORY, `${hostKey}.json`);
}

function crossHostSubject(evidence) {
  return {
    environment: evidence.environment,
    stateDigests: summaryDigests(evidence.immutableState.before),
    renderContractDigest: canonicalDigest(evidence.renderContract),
    appearance: evidence.repeatability.independentRuns[0].appearance,
  };
}

async function registeredHostKeys(authoritativeHostKey) {
  let entries = [];
  try {
    entries = await readdir(HOST_EVIDENCE_DIRECTORY);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return [
    authoritativeHostKey,
    ...entries
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -".json".length)),
  ];
}

async function writeOrCheckEvidence(evidence, evidencePath = EVIDENCE_PATH) {
  // The authoritative profile records one specific normative host. Only that
  // host may rewrite it; anything else records its own profile instead.
  assert.equal(
    evidencePath === EVIDENCE_PATH,
    describeNormativeHost(evidence.environment).hostKey ===
      AUTHORITATIVE_HOST_KEY,
    "only the authoritative normative host may write the authoritative observation profile",
  );
  if (!checkOnly) {
    await mkdir(path.dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    return;
  }
  let frozen;
  try {
    frozen = JSON.parse(await readFile(evidencePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      assert.fail(
        `${path.relative(PROJECT_ROOT, evidencePath)} is not frozen; run npm run observe:reference`,
      );
    }
    throw error;
  }
  assert.equal(frozen.repeatability.appearanceWithinDeclaredBounds, true);
  assert.equal(
    frozen.repeatability.independentRuns.length,
    evidence.repeatability.independentRuns.length,
  );
  evidence.repeatability.independentRuns.forEach((run, index) => {
    assertAppearanceWithinDeclaredBounds(
      frozen.repeatability.independentRuns[index].appearance,
      run.appearance,
      `fresh run ${index + 1} versus frozen native appearance`,
    );
  });
  assert.deepEqual(
    stableEvidenceProjection(evidence),
    stableEvidenceProjection(frozen),
    `${path.relative(PROJECT_ROOT, evidencePath)} stable evidence drifted`,
  );
}

async function main() {
  assert.deepEqual(validateReferenceObservationContract(contract), []);
  assert.deepEqual(
    validateCrossHostObservationContract(
      crossHostContract,
      contract.repeatability.appearance,
    ),
    [],
  );
  const [referenceSource, localLights] = await Promise.all([
    readFile(path.join(PROJECT_ROOT, contract.reference.sourcePath), "utf8"),
    readFile(
      path.join(PROJECT_ROOT, contract.renderContract.localLights.sourcePath),
      "utf8",
    ).then(JSON.parse),
  ]);
  assert.equal(sha256(referenceSource), contract.reference.sourceSha256);
  const renderContractErrors = verifySceneRenderContractSource({
    source: referenceSource,
    localLights,
    contract,
  });
  assert.deepEqual(renderContractErrors, []);

  const runs = [];
  for (let index = 0; index < contract.repeatability.independentRuns; index += 1) {
    runs.push(await observe(index));
  }
  for (const run of runs) {
    assert.equal(run.state.status, "complete");
    const report = run.state.report;
    assert.equal(report.schemaVersion, "reference-observation-evidence-v1");
    assert.equal(report.primary.immutability.unchanged, true);
    assert.deepEqual(
      summaryDigests(report.primary.immutability.before),
      summaryDigests(report.primary.immutability.after),
    );
    assert.equal(report.primary.result.source.exactMatch, true);
    assert.equal(report.primary.result.source.sha256, contract.reference.sourceSha256);
    assert.equal(report.primary.result.environment.threeRevision, contract.capture.threeRevision);
    assert.deepEqual(
      report.primary.result.capture.cssViewport,
      contract.capture.cssViewport,
    );
    assert.deepEqual(
      report.primary.result.capture.framebuffer,
      contract.capture.framebuffer,
    );
    assert.equal(
      report.primary.result.capture.deviceScaleFactor,
      contract.capture.deviceScaleFactor,
    );
    const actualCamera = report.primary.result.capture.camera;
    assert.deepEqual(actualCamera.position, contract.cameras.authoredOverview.position);
    assert.equal(actualCamera.fov, contract.cameras.authoredOverview.verticalFovDegrees);
    assert.equal(actualCamera.near, contract.cameras.authoredOverview.near);
    assert.equal(actualCamera.far, contract.cameras.authoredOverview.far);
    assertVectorClose(
      actualCamera.direction,
      roundedDirection(
        contract.cameras.authoredOverview.position,
        contract.cameras.authoredOverview.target,
      ),
      "authored overview direction",
    );
    const runtimeBounds = report.primary.result.assembledScene.runtimeBounds;
    assert.deepEqual(
      [runtimeBounds.center[0], runtimeBounds.groundY, runtimeBounds.center[1]],
      contract.sceneAnchor,
    );
    assert.equal(report.dynamicCaptures.length, contract.clock.dynamicMomentsMs.length);
    assert.deepEqual(
      report.dynamicCaptures.map(({ momentMs }) => momentMs),
      contract.clock.dynamicMomentsMs,
    );
    assert.equal(
      report.primary.result.appearanceIntegrity.referenceMaterialsOrLightsInjected,
      false,
    );
    assert.deepEqual(
      report.primary.result.renderContract.runtime.verificationErrors,
      [],
    );
    for (const capture of report.dynamicCaptures) {
      assert.equal(capture.stateTransition.withinDeclaredChanges, true);
      assert.deepEqual(capture.stateTransition.allowedChanges, [
        "transforms",
        "dynamic",
      ]);
      assert.ok(
        capture.stateTransition.changedSummaries.every((name) =>
          ["transforms", "dynamic"].includes(name),
        ),
      );
    }
  }

  assert.deepEqual(
    withoutAppearance(runs[0].state.report),
    withoutAppearance(runs[1].state.report),
    "independent non-appearance reference observations are not exactly repeatable",
  );
  const cameraSet = buildCameraSet(runs[0].state.report);
  assert.deepEqual(cameraSet, buildCameraSet(runs[1].state.report));

  const appearances = runs.map((run) => run.state.report.primary.result.appearance);
  const appearanceDeltas = assertAppearanceWithinDeclaredBounds(
    appearances[0],
    appearances[1],
    "independent native appearance runs",
  );

  /**
   * The same envelope at every declared dynamic moment.
   *
   * Until this existed, a dynamic moment was checked for structural change and never for
   * whether it renders the same thing twice — which is the whole point of pinning the
   * clock. A moment that drifted between runs would make every capture taken at it
   * unreproducible, and nothing would have said so.
   */
  const dynamicAppearanceDeltas = runs[0].state.report.dynamicCaptures.map((capture, index) => {
    const other = runs[1].state.report.dynamicCaptures[index];
    assert.equal(
      other.momentMs,
      capture.momentMs,
      "the two runs visited the declared dynamic moments in different orders",
    );
    return {
      momentMs: capture.momentMs,
      deltas: assertAppearanceWithinDeclaredBounds(
        capture.appearance,
        other.appearance,
        `independent runs at moment ${capture.momentMs} ms`,
      ),
    };
  });
  // Per-moment evidence with the worst moment retained, which is what every other layer
  // in this stack does and what ticket 13 asks for.
  const worstDynamicMoment = dynamicAppearanceDeltas.reduce(
    (worst, row) =>
      worst === null ||
      row.deltas.maximumMeanChannelDelta > worst.deltas.maximumMeanChannelDelta
        ? row
        : worst,
    null,
  );

  const report = runs[0].state.report;
  const evidence = {
    schemaVersion: "reference-observation-evidence-v1",
    authority: contract.authority,
    contract,
    sourceVerification: {
      path: contract.reference.sourcePath,
      sha256: contract.reference.sourceSha256,
      renderContractErrors,
    },
    renderContract: report.primary.result.renderContract,
    cameraSet,
    environment: report.primary.result.environment,
    capture: report.primary.result.capture,
    assembledScene: report.primary.result.assembledScene,
    immutableState: report.primary.immutability,
    dynamicCaptures: report.dynamicCaptures,
    appearanceIntegrity: {
      ...report.primary.result.appearanceIntegrity,
      primaryCapturePngSha256: runs[0].screenshotPngSha256,
      primaryCaptureByteLength: runs[0].screenshotByteLength,
    },
    repeatability: {
      declared: contract.repeatability,
      independentRuns: runs.map((run, index) => ({
        run: index + 1,
        primaryCapturePngSha256: run.screenshotPngSha256,
        appearance: run.state.report.primary.result.appearance,
        stateDigests: summaryDigests(run.state.report.primary.immutability.before),
        dynamicDigests: run.state.report.dynamicCaptures.map((capture) => ({
          momentMs: capture.momentMs,
          dynamic: capture.dynamic.digest,
          transforms: capture.transforms.digest,
        })),
      })),
      appearanceDeltas,
      dynamicAppearanceDeltas,
      worstDynamicMoment,
      structuralExact: true,
      appearanceWithinDeclaredBounds: true,
    },
  };

  const authoritative = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
  const authoritativeHost = describeNormativeHost(authoritative.environment);
  const observedHost = describeNormativeHost(evidence.environment);
  evidence.host = observedHost;
  // The frozen profile normally describes the declared authoritative host. The
  // one exception is an ADR-declared migration of that declaration, where the
  // incoming authoritative host is the one observing and the frozen profile
  // still describes the outgoing one. See ADR-0050. Check mode never accepts it:
  // a half-migrated declaration is a real failure, not a frozen state.
  const migratingAuthority =
    !checkOnly &&
    authoritativeHost.hostKey !== AUTHORITATIVE_HOST_KEY &&
    observedHost.hostKey === AUTHORITATIVE_HOST_KEY;
  assert.ok(
    authoritativeHost.hostKey === AUTHORITATIVE_HOST_KEY || migratingAuthority,
    `the authoritative observation profile describes ${authoritativeHost.hostKey}, ` +
      `not the declared normative host ${AUTHORITATIVE_HOST_KEY}`,
  );

  if (observedHost.hostKey === AUTHORITATIVE_HOST_KEY) {
    await Promise.all([
      writeOrCheck(CAMERA_SET_PATH, cameraSet),
      writeOrCheckEvidence(evidence),
    ]);
    process.stdout.write(
      `Reference observation v1: OK on the authoritative host ${observedHost.hostKey} (${runs.length} structurally exact runs, bounded native appearance, ${checkOnly ? "frozen evidence verified" : "evidence frozen"})\n`,
    );
    return;
  }

  // A second normative host observes the same unmodified reference. The
  // authoritative macOS profile is never rewritten from here; this host records
  // its own profile and must reproduce every scene-determined fact exactly.
  const crossHostErrors = verifyCrossHostObservation({
    authoritative: crossHostSubject(authoritative),
    observed: crossHostSubject(evidence),
    crossHost: crossHostContract,
    registeredHostKeys: checkOnly
      ? await registeredHostKeys(authoritativeHost.hostKey)
      : null,
  });
  assert.deepEqual(
    crossHostErrors,
    [],
    `cross-host reference observation failed on ${observedHost.hostKey}`,
  );
  assert.deepEqual(
    cameraSet,
    authoritative.cameraSet,
    "the frozen Scene Evaluation Camera Set must be identical on every normative host",
  );
  assert.deepEqual(
    hostInvariantProjection(evidence),
    hostInvariantProjection(authoritative),
    `${observedHost.hostKey} observed a different Assembled Authored Scene than the authoritative profile`,
  );
  assert.deepEqual(
    authoritative.contract,
    contract,
    "the authoritative profile was frozen under a different Reference Observation contract",
  );
  await assertFrozenFile(
    CAMERA_SET_PATH,
    `${JSON.stringify(authoritative.cameraSet, null, 2)}\n`,
  );

  evidence.crossHost = {
    authoritativeProfile: path.relative(PROJECT_ROOT, EVIDENCE_PATH).replace(/\\/g, "/"),
    authoritativeHost,
    structuralDigestsExact: true,
    renderContractExact: true,
    cameraSetExact: true,
    appearanceDeltas: compareAppearance(
      authoritative.repeatability.independentRuns[0].appearance,
      appearances[0],
    ),
    declared: crossHostContract,
  };
  await writeOrCheckEvidence(evidence, hostEvidencePath(observedHost.hostKey));
  process.stdout.write(
    `Reference observation v1: OK on normative host ${observedHost.hostKey} (${runs.length} structurally exact runs, scene evidence identical to ${authoritativeHost.hostKey}, cross-host appearance within declared bounds, ${checkOnly ? "host profile verified" : "host profile recorded"})\n`,
  );
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
