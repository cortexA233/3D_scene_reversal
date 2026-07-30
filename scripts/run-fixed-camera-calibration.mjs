/**
 * Calibrate the fixed-camera and native-appearance gate layers.
 *
 * Renders the reference against declared perturbed clones of itself through the
 * six frozen cameras, using scene-space damage, and freezes a threshold per
 * metric. The two layers ADR-0040 leaves uncalibrated are the reason the gate
 * stack cannot express a pass at all, so this is what unblocks it.
 *
 *   node scripts/run-fixed-camera-calibration.mjs --control identity,translate-12
 *   node scripts/run-fixed-camera-calibration.mjs --aggregate
 *   node scripts/run-fixed-camera-calibration.mjs --aggregate --check
 *   node scripts/run-fixed-camera-calibration.mjs --list
 *
 * Why it runs one batch at a time. A 1440x810 render plus readPixels costs about
 * eight seconds under SwiftShader, and a geometry control needs four passes on
 * each side of six cameras. A single run over every declared control would take
 * roughly an hour and be killed long before it finished, so each invocation
 * captures a batch, writes one partial evidence file per control, and
 * `--aggregate` combines them. The undamaged capture is taken once per camera and
 * shared by every control in the batch, which is why batching two or three
 * controls costs much less than running them separately.
 */

import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";
import { createFrozenObservationClockPreload } from "../tools/reference/frozen-observation-clock.mjs";
import { createReferenceObservationContract } from "../tools/reference/reference-observation-contract.mjs";
import { verifyCalibrationCaptureProtocol } from "../tools/evaluation/scene-pass-protocol.mjs";
import { undetectedControls } from "../tools/evaluation/scene-calibration.mjs";
import {
  FIXED_CAMERA_METRICS,
  NATIVE_APPEARANCE_METRICS,
  buildCalibratedLayers,
} from "../tools/evaluation/fixed-camera-calibration.mjs";
import {
  SCENE_GRAPH_CONTROLS,
  findControl,
} from "../tools/evaluation/scene-graph-perturbations.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const EVIDENCE_DIRECTORY = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence",
);
const PARTIAL_DIRECTORY = path.join(EVIDENCE_DIRECTORY, "fixed-camera-controls");
const REPORT_PATH = path.join(EVIDENCE_DIRECTORY, "fixed-camera-calibration-v1.json");

const argv = process.argv.slice(2);
const flag = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null;
};
const checkOnly = argv.includes("--check");

/**
 * Any module the candidate is built from. The calibration page must not load one:
 * a threshold derived where the candidate was available is not reference-only,
 * and the page's own request log is the evidence, not a comment in the page.
 */
const CANDIDATE_MODULE_PATTERN =
  /(scene-generator|object-generator|environment-recipe|\/src\/reconstruction\/(?!scene\/island-scene-recipe\.generated\.js))/i;

async function capture(controlIds) {
  const contract = createReferenceObservationContract();
  const query = new URLSearchParams({
    ...contract.reference.urlOptions,
    controls: controlIds.join(","),
  });
  const run = await runLocalSceneAutomation({
    label: "scene-calibration",
    serverFlag: "--scene-calibration",
    path: "/scene-calibration.html",
    query: `?${query.toString()}`,
    readyState: { status: "ready" },
    timeoutMs: 3_600_000,
    port: 8520,
    probeExpression: `(() => {
      const run = window.sceneCalibration;
      return {
        state: run?.status === "error" ? "error" : null,
        status: run?.status ?? null,
        statusText: run?.error ?? run?.progress ?? null,
      };
    })()`,
    // The auxiliary passes reuse the renderer that already holds the authored
    // geometry, and the native capture goes through the authored composer,
    // exactly as the acceptance capture does.
    runtimeObjectAttachment: {
      whenState: { status: "awaiting-reference-renderer" },
      prototypeExpressions: [
        "window.__scenePassTypes.WebGLRenderer.prototype",
        "window.__scenePassTypes.EffectComposer.prototype",
      ],
      targetExpression: "window.sceneCalibration",
      functionDeclaration: `function (renderers, composers) {
        const renderer = Array.from(renderers).find(
          (candidate) => candidate.domElement === document.querySelector("canvas"),
        );
        const composer = Array.from(composers).find(
          (candidate) => candidate.renderer === renderer,
        );
        return this.attachReferenceRenderer({ renderer, composer });
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
    postReadyExpression: "window.sceneCalibration.complete()",
  });
  assert.equal(
    run.state.status,
    "ready",
    run.state.error ?? "the calibration capture did not complete",
  );

  const report = run.state.report;
  assert.equal(report.schemaVersion, "fixed-camera-calibration-v1");

  // Reference-only, proven from what the page actually fetched.
  const candidateModules = run.requests
    .map((url) => new URL(url).pathname)
    .filter((pathname) => CANDIDATE_MODULE_PATTERN.test(pathname));
  report.subjects.candidateModulesLoaded = [...new Set(candidateModules)].sort();
  report.subjects.requestedModules = [
    ...new Set(
      run.requests
        .map((url) => new URL(url).pathname)
        .filter((pathname) => /\.(mjs|js)$/.test(pathname) && !pathname.startsWith("/vendor/")),
    ),
  ].sort();

  assert.deepEqual(
    verifyCalibrationCaptureProtocol({ report, contract }),
    [],
    "the calibration capture protocol was violated",
  );
  return report;
}

async function runControls(controlIds) {
  const controls = controlIds.map(findControl);
  const report = await capture(controls.map((control) => control.id));
  await mkdir(PARTIAL_DIRECTORY, { recursive: true });

  for (const control of report.controls) {
    // One file per control so a batch that is interrupted keeps what it finished
    // and a single control can be re-measured without re-running the rest.
    const partial = {
      schemaVersion: report.schemaVersion,
      perturbationSchema: report.perturbationSchema,
      capture: report.capture,
      protocol: report.protocol,
      mutation: report.mutation,
      subjects: report.subjects,
      inventory: report.inventory,
      control,
    };
    await writeFile(
      path.join(PARTIAL_DIRECTORY, `${control.id}.json`),
      `${JSON.stringify(partial, null, 2)}\n`,
    );
    process.stdout.write(
      `  ${control.id} (${control.class}): ` +
        `group IoU ${control.aggregate.groupSilhouetteIoU.mean}, ` +
        `group contour p95 ${control.aggregate.groupContourDistance.meanP95}, ` +
        `group depth p95 ${control.aggregate.groupDepthWorldUnits.meanP95}, ` +
        `group normal p95 ${control.aggregate.groupWorldNormalDegrees.meanP95}, ` +
        `semantic ${control.aggregate.semanticAgreement.mean}, ` +
        `confusion ${control.aggregate.semanticConfusion.worstFraction}, ` +
        `DeltaE ${control.aggregate.appearanceDeltaE.meanMean}, ` +
        `family DeltaE ${control.aggregate.appearanceByMaterialFamily.meanMean}\n`,
    );
  }
  process.stdout.write(
    `Captured ${report.controls.length} control(s) through ${report.protocol.length} frozen cameras.\n`,
  );
}

async function readPartials() {
  let names;
  try {
    names = (await readdir(PARTIAL_DIRECTORY)).filter((name) => name.endsWith(".json"));
  } catch {
    throw new Error(
      `no control evidence in ${path.relative(PROJECT_ROOT, PARTIAL_DIRECTORY)}; ` +
        "run --control <ids> first",
    );
  }
  const partials = await Promise.all(
    names.map((name) =>
      readFile(path.join(PARTIAL_DIRECTORY, name), "utf8").then(JSON.parse),
    ),
  );
  return partials.sort((left, right) => left.control.id.localeCompare(right.control.id));
}

async function aggregate() {
  const partials = await readPartials();

  const missing = SCENE_GRAPH_CONTROLS.filter(
    (control) => !partials.some((partial) => partial.control.id === control.id),
  ).map((control) => control.id);
  assert.deepEqual(
    missing,
    [],
    "every declared control has to be measured before a threshold can be frozen",
  );

  // Every partial has to have been captured against the same declared damage
  // targets. The inventory is the fingerprint of that: if a control definition
  // changed between batches, one partial reports a different set of placement
  // roots or materials and the bracket would be assembled from two different
  // experiments. This is not hypothetical — an earlier revision of the terrain
  // control selected eleven roots instead of one.
  const fingerprint = JSON.stringify(partials[0].inventory);
  for (const partial of partials) {
    assert.equal(
      JSON.stringify(partial.inventory),
      fingerprint,
      `${partial.control.id} was captured against different damage targets; re-measure it`,
    );
    assert.equal(
      partial.perturbationSchema,
      partials[0].perturbationSchema,
      `${partial.control.id} was captured against a different perturbation schema`,
    );
  }

  // The mutation audit is per capture. A partial whose restore could not be
  // verified would have contaminated every later control in its own batch.
  for (const partial of partials) {
    assert.deepEqual(
      partial.mutation.restoreFailures,
      [],
      `${partial.control.id}: the reference was not restored cleanly`,
    );
    assert.deepEqual(
      partial.subjects.candidateModulesLoaded,
      [],
      `${partial.control.id}: the calibration page loaded a candidate module`,
    );
  }

  // `class` and `detects` come from the live declaration, not from the partial.
  // They are statements about which metric a control is responsible for, not
  // measurements, so correcting one must not require re-rendering six cameras.
  // The partial keeps its own copy as a record of what was declared when it was
  // captured.
  const rows = partials.map((partial) => {
    const declared = findControl(partial.control.id);
    return {
      id: declared.id,
      class: declared.class,
      detects: declared.detects,
      // Shaped like the gate stack's evidence object, whose `passes` key holds the
      // pass report, so a metric's declared path is evaluated here by the same
      // expression acceptance will evaluate it by.
      report: { passes: { aggregate: partial.control.aggregate } },
    };
  });

  const { layers, metrics, diagnostic } = buildCalibratedLayers(rows);

  // Every declared damage control must be caught by at least one gating metric.
  // A control nothing detects is a hole in the bracket, not a passing result, and
  // it is exactly how a calibration ends up freezing only the metrics that
  // happened to separate.
  assert.deepEqual(
    undetectedControls({ controls: SCENE_GRAPH_CONTROLS, metrics }),
    [],
    "declared damage controls that no gating metric detects leave a hole in the bracket",
  );

  const report = {
    schemaVersion: "fixed-camera-calibration-v1",
    perturbationSchema: partials[0].perturbationSchema,
    note:
      "Thresholds for the two rendered gate layers, calibrated from declared scene-space damage to the reference rendered through the six frozen cameras. No candidate observation, report, or module took part.",
    capture: partials[0].capture,
    inventory: partials[0].inventory,
    inputs: partials.map(
      (partial) =>
        `.scratch/scene-parity-foundation/evidence/fixed-camera-controls/${partial.control.id}.json`,
    ),
    candidateArtifactsRead: [],
    modulesLoadedByTheCalibrationPage: partials[0].subjects.requestedModules ?? [],
    controls: partials.map((partial) => {
      const declared = findControl(partial.control.id);
      return {
        id: declared.id,
        class: declared.class,
        needs: declared.needs,
        detects: declared.detects ?? [],
        note: declared.note ?? null,
      };
    }),
    metrics,
    layers,
    diagnostic,
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (checkOnly) {
    assert.equal(
      await readFile(REPORT_PATH, "utf8"),
      serialized,
      "the fixed-camera calibration report drifted",
    );
  } else {
    await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
    await writeFile(REPORT_PATH, serialized);
  }

  const gating = metrics.filter((metric) => metric.calibration.separable);
  const demoted = metrics.filter((metric) => !metric.calibration.separable);
  process.stdout.write(
    `Fixed-camera calibration: ${gating.length} gating metrics, ${demoted.length} demoted to diagnostic, ` +
      `from ${partials.length} controls\n`,
  );
  for (const metric of gating) {
    process.stdout.write(
      `  ${metric.layer}/${metric.name}: ${metric.direction} ${metric.calibration.threshold} ` +
        `(mild worst ${metric.calibration.mildWorst}, damage best ${metric.calibration.severeBest})\n`,
    );
  }
  for (const metric of demoted) {
    process.stdout.write(`  diagnostic: ${metric.name} — ${metric.calibration.reason}\n`);
  }
}

async function main() {
  if (argv.includes("--list")) {
    for (const control of SCENE_GRAPH_CONTROLS) {
      process.stdout.write(
        `${control.id}\t${control.class}\t${control.needs.join("+")}\t${(control.detects ?? []).length} metrics\n`,
      );
    }
    process.stdout.write(
      `\n${FIXED_CAMERA_METRICS.length} fixed-camera and ${NATIVE_APPEARANCE_METRICS.length} appearance metrics are declared.\n`,
    );
    return;
  }
  if (argv.includes("--aggregate")) {
    await aggregate();
    return;
  }
  const controls = flag("--control");
  assert.ok(
    controls,
    "pass --control <id[,id...]> to capture, --aggregate to freeze, or --list",
  );
  await runControls(controls.split(",").map((entry) => entry.trim()).filter(Boolean));
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
