import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";
import { createFrozenObservationClockPreload } from "../tools/reference/frozen-observation-clock.mjs";
import {
  createReferenceObservationContract,
  validateReferenceObservationContract,
} from "../tools/reference/reference-observation-contract.mjs";
import { verifySceneRenderContractSource } from "../tools/reference/scene-render-contract-source.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CAMERA_SET_PATH = path.join(
  PROJECT_ROOT,
  "tools/reference/baselines/reference-camera-set-v1.json",
);
const EVIDENCE_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence/reference-observation-v1.json",
);
const checkOnly = process.argv.includes("--check");
const contract = createReferenceObservationContract();

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
  return result;
}

function buildCameraSet(report) {
  const observedCamera = report.primary.result.capture.camera;
  return {
    schemaVersion: "reference-camera-set-v1",
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
  for (const run of result.repeatability.independentRuns) {
    delete run.primaryCapturePngSha256;
    delete run.appearance;
  }
  return result;
}

async function writeOrCheckEvidence(evidence) {
  if (!checkOnly) {
    await mkdir(path.dirname(EVIDENCE_PATH), { recursive: true });
    await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
    return;
  }
  let frozen;
  try {
    frozen = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      assert.fail(
        `${path.relative(PROJECT_ROOT, EVIDENCE_PATH)} is not frozen; run npm run observe:reference`,
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
    `${path.relative(PROJECT_ROOT, EVIDENCE_PATH)} stable evidence drifted`,
  );
}

async function main() {
  assert.deepEqual(validateReferenceObservationContract(contract), []);
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
      structuralExact: true,
      appearanceWithinDeclaredBounds: true,
    },
  };

  await Promise.all([
    writeOrCheck(CAMERA_SET_PATH, cameraSet),
    writeOrCheckEvidence(evidence),
  ]);
  process.stdout.write(
    `Reference observation v1: OK (${runs.length} structurally exact runs, bounded native appearance, ${checkOnly ? "frozen evidence verified" : "evidence frozen"})\n`,
  );
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
