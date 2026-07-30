/**
 * Calibrate and freeze Scene Quality Baseline v1.
 *
 * Runs every declared reference-only control through the same metric
 * implementations acceptance uses, proves each metric separates mild variation
 * from declared damage, and writes the frozen baseline.
 *
 * The input graph is reference evidence and controls only. No candidate
 * observation, report, or derived file is read, and that is checked rather than
 * asserted in prose.
 *
 *   node scripts/run-scene-calibration.mjs
 *   node scripts/run-scene-calibration.mjs --check
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { observeAuthoredReference } from "../tools/evaluation/scene-observation.mjs";
import { compareScenes } from "../tools/evaluation/scene-correspondence.mjs";
import {
  compareGeography,
  traceCoastContour,
} from "../tools/evaluation/geography-evidence.mjs";
import { compareHorizonProfiles } from "../tools/evaluation/horizon-evidence.mjs";
import { elevationSampler } from "../tools/reconstruction/fit-terrain-program.mjs";
import {
  BASELINE_SCHEMA,
  CALIBRATION_SCHEMA,
  buildLayer,
  selectThreshold,
  undetectedControls,
  verifyCalibrationInputs,
} from "../tools/evaluation/scene-calibration.mjs";
import {
  GEOGRAPHY_CONTROLS,
  HORIZON_CONTROLS,
  SCENE_CONTROLS,
} from "../tools/evaluation/scene-perturbations.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const EVIDENCE_DIRECTORY = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence",
);
const BASELINE_DIRECTORY = path.join(PROJECT_ROOT, "tools/acceptance/baselines");
const BASELINE_PATH = path.join(BASELINE_DIRECTORY, "scene-quality-baseline-v1.json");
const CALIBRATION_PATH = path.join(EVIDENCE_DIRECTORY, "scene-calibration-v1.json");
const checkOnly = process.argv.includes("--check");

/** Every file this calibration is allowed to read. */
const CALIBRATION_INPUTS = [
  "scene-inventory-v1.json",
  "scene-surface-samples-v1.json",
  "terrain-elevation-v1.json",
  "horizon-reference-v1.json",
  "reference-observation-v1.json",
];

const SCENE_ANCHOR = [86, 26, -24];

/**
 * Mild samples come from every identity and mild control. Severe samples come
 * only from the damage controls that declare this metric, because a control is
 * responsible for the failure it targets, not for every metric in the stack.
 */
function collect(rows, definition) {
  const mild = [];
  const severe = [];
  const detectedControls = [];
  for (const row of rows) {
    const value = definition.select(row.report);
    if (!Number.isFinite(value)) continue;
    if (row.class === "identity" || row.class === "mild") {
      mild.push(value);
    } else if (row.class === "severe" && row.detects?.includes(definition.name)) {
      severe.push(value);
      detectedControls.push(row.id);
    }
  }
  return { mild, severe, detectedControls };
}

function calibrateMetric(rows, definition) {
  const { mild, severe, detectedControls } = collect(rows, definition);
  return {
    ...definition,
    detectedControls,
    samples: { mild, severe },
    calibration: selectThreshold({
      mild,
      severe,
      direction: definition.direction,
      exact: definition.exact === true,
    }),
  };
}

async function main() {
  const inputFailures = verifyCalibrationInputs(CALIBRATION_INPUTS);
  assert.deepEqual(
    inputFailures,
    [],
    "the calibration input graph contains a candidate-derived artifact",
  );

  const [inventory, samples, elevationEvidence, horizonEvidence] = await Promise.all(
    [
      "scene-inventory-v1.json",
      "scene-surface-samples-v1.json",
      "terrain-elevation-v1.json",
      "horizon-reference-v1.json",
    ].map((name) =>
      readFile(path.join(EVIDENCE_DIRECTORY, name), "utf8").then(JSON.parse),
    ),
  );

  // ── Structural and world-geometry layers ─────────────────────────────────
  const reference = observeAuthoredReference({ inventory, samples });
  const sceneRows = SCENE_CONTROLS.map((control) => ({
    id: control.id,
    class: control.class,
    detects: control.detects,
    report: compareScenes(reference, control.apply(reference), {
      sceneAnchor: SCENE_ANCHOR,
    }),
  }));

  // ── Geography layer ──────────────────────────────────────────────────────
  const sampler = elevationSampler(elevationEvidence);
  const referenceElevation = (x, z) => sampler.at(x, z);
  const oceanBounds = { min: [-37000, 15, -37000], max: [37000, 17, 37000] };
  const geographyRows = GEOGRAPHY_CONTROLS.map((control) => ({
    id: control.id,
    class: control.class,
    detects: control.detects,
    report: compareGeography({
      referenceElevation,
      candidateElevation: control.elevation(referenceElevation),
      centre: [86, -24],
      seaLevel: 16,
      seaLevelNormal: [0, 1, 0],
      oceanBounds,
      probeResolution: 65,
      probeReach: 420,
    }),
  }));

  // ── Horizon layer ────────────────────────────────────────────────────────
  const horizonRows = HORIZON_CONTROLS.map((control) => ({
    id: control.id,
    class: control.class,
    detects: control.detects,
    report: {
      profile: compareHorizonProfiles(
        horizonEvidence.combined,
        control.profile(horizonEvidence.combined),
        horizonEvidence.bins,
      ),
    },
  }));

  const structural = [
    {
      name: "missing entities",
      scope: "aggregate",
      path: "correspondence.structural.missing.length",
      direction: "atMost",
      exact: true,
      select: (report) => report.structural.missing.length,
    },
    {
      name: "extra entities",
      scope: "aggregate",
      path: "correspondence.structural.extra.length",
      direction: "atMost",
      exact: true,
      select: (report) => report.structural.extra.length,
    },
    {
      name: "anchor error p95",
      scope: "aggregate",
      path: "correspondence.placement.anchorError.p95",
      direction: "atMost",
      select: (report) => report.placement.anchorError?.p95,
    },
    {
      name: "worst entity anchor error",
      scope: "worst-entity",
      path: "correspondence.placement.anchorError.max",
      direction: "atMost",
      select: (report) => report.placement.anchorError?.max,
    },
    {
      name: "worst entity extent error",
      scope: "worst-entity",
      path: "correspondence.placement.extentRelative.max",
      direction: "atMost",
      select: (report) => report.placement.extentRelative?.max,
    },
    {
      name: "worst entity orientation error",
      scope: "worst-entity",
      path: "correspondence.placement.orientationError.max",
      direction: "atMost",
      select: (report) => report.placement.orientationError?.max,
    },
  ].map((definition) => calibrateMetric(sceneRows, definition));

  const worldGeometry = [
    {
      name: "surface p95",
      scope: "aggregate",
      path: "correspondence.surface.p95.mean",
      direction: "atMost",
      select: (report) => report.surface.p95?.mean,
    },
    {
      name: "worst entity surface p95",
      scope: "worst-entity",
      path: "correspondence.surface.p95.max",
      direction: "atMost",
      select: (report) => report.surface.p95?.max,
    },
    {
      name: "over-tolerance surface fraction",
      scope: "aggregate",
      path: "correspondence.surface.overToleranceFraction.mean",
      direction: "atMost",
      select: (report) => report.surface.overToleranceFraction?.mean,
    },
    {
      name: "worst neighbourhood distance error",
      scope: "worst-entity",
      path: "correspondence.relational.distanceError.max",
      direction: "atMost",
      select: (report) => report.relational.distanceError?.max,
    },
    {
      name: "worst zone occupancy delta",
      scope: "worst-zone",
      path: "correspondence.zones.delta.max",
      direction: "atMost",
      select: (report) => report.zones.delta?.max,
    },
    {
      name: "worst component deficit",
      scope: "worst-entity",
      path: "correspondence.semanticStructure.componentDeficit.max",
      direction: "atMost",
      select: (report) => report.semanticStructure.componentDeficit?.max,
    },
  ].map((definition) => calibrateMetric(sceneRows, definition));

  const geography = [
    {
      name: "terrain height p95",
      scope: "aggregate",
      path: "geography.height.full.p95",
      direction: "atMost",
      select: (report) => report.height.full?.p95,
    },
    {
      name: "shore height p95",
      scope: "worst-region",
      path: "geography.height.shore.p95",
      direction: "atMost",
      select: (report) => report.height.shore?.p95,
    },
    {
      name: "coastline symmetric p95",
      scope: "aggregate",
      path: "geography.coastline.symmetricDistance.p95",
      direction: "atMost",
      select: (report) => report.coastline.symmetricDistance?.p95,
    },
    {
      name: "coastline area error",
      scope: "aggregate",
      path: "geography.coastline.areaRelativeError",
      direction: "atMost",
      select: (report) => report.coastline.areaRelativeError,
    },
    {
      name: "land and sea agreement",
      scope: "aggregate",
      path: "geography.classification.agreementFraction",
      direction: "atLeast",
      select: (report) => report.classification.agreementFraction,
    },
  ].map((definition) => calibrateMetric(geographyRows, definition));

  const horizon = [
    {
      name: "horizon profile p95",
      scope: "aggregate",
      path: "horizon.profile.angularError.p95",
      direction: "atMost",
      select: (report) => report.profile.angularError?.p95,
    },
    {
      name: "worst azimuth horizon error",
      scope: "worst-azimuth",
      path: "horizon.profile.angularError.max",
      direction: "atMost",
      select: (report) => report.profile.angularError?.max,
    },
  ].map((definition) => calibrateMetric(horizonRows, definition));

  const structuralLayer = buildLayer(structural);
  const worldLayer = buildLayer([...worldGeometry, ...geography, ...horizon]);

  const calibration = {
    schemaVersion: CALIBRATION_SCHEMA,
    inputs: CALIBRATION_INPUTS,
    candidateArtifactsRead: [],
    controls: {
      scene: SCENE_CONTROLS.map(({ id, class: klass }) => ({ id, class: klass })),
      geography: GEOGRAPHY_CONTROLS.map(({ id, class: klass }) => ({ id, class: klass })),
      horizon: HORIZON_CONTROLS.map(({ id, class: klass }) => ({ id, class: klass })),
    },
    metrics: [...structural, ...worldGeometry, ...geography, ...horizon].map((metric) => ({
      name: metric.name,
      scope: metric.scope,
      path: metric.path,
      direction: metric.direction,
      detectedControls: metric.detectedControls,
      samples: metric.samples,
      calibration: metric.calibration,
    })),
  };

  const separable = calibration.metrics.filter((metric) => metric.calibration.separable);
  const diagnostic = calibration.metrics.filter((metric) => !metric.calibration.separable);

  // Every declared damage control must be caught by at least one gating metric.
  const allMetrics = [...structural, ...worldGeometry, ...geography, ...horizon];
  const missed = [
    ...undetectedControls({ controls: SCENE_CONTROLS, metrics: allMetrics }),
    ...undetectedControls({ controls: GEOGRAPHY_CONTROLS, metrics: allMetrics }),
    ...undetectedControls({ controls: HORIZON_CONTROLS, metrics: allMetrics }),
  ];
  assert.deepEqual(
    missed,
    [],
    "declared damage controls that no gating metric detects leave a hole in the bracket",
  );
  calibration.undetectedControls = missed;

  const baseline = {
    schemaVersion: BASELINE_SCHEMA,
    version: "scene-quality-baseline-v1",
    calibratedFrom: CALIBRATION_SCHEMA,
    note: "Calibrated from reference repeatability and declared reference-only perturbations before any candidate result was consulted. Changing a value requires an explicit migration and full recalibration.",
    knownProperties: [
      "Placement and surface limits are absolute world units, and the mild controls apply to every entity including the 1.4 km horizon groups, so those limits are dominated by the largest objects. A small entity can therefore pass a limit that is generous for its own scale. Scale-relative placement evidence is the declared next refinement.",
    ],
    layers: {
      structuralCorrespondence: structuralLayer.gating,
      worldGeometry: worldLayer.gating,
      // Fixed-camera and native-appearance limits are calibrated separately by
      // the browser control run, which renders declared reference-only damage
      // through the same six frozen cameras.
      fixedCameraGeometry: [],
      nativeAppearance: [],
    },
    diagnostic: [...structuralLayer.diagnostic, ...worldLayer.diagnostic],
  };

  const calibrationSerialized = `${JSON.stringify(calibration, null, 2)}\n`;
  const baselineSerialized = `${JSON.stringify(baseline, null, 2)}\n`;
  if (checkOnly) {
    assert.equal(
      await readFile(CALIBRATION_PATH, "utf8"),
      calibrationSerialized,
      "the calibration report drifted",
    );
    assert.equal(
      await readFile(BASELINE_PATH, "utf8"),
      baselineSerialized,
      "the frozen Scene Quality Baseline drifted",
    );
  } else {
    await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
    await mkdir(BASELINE_DIRECTORY, { recursive: true });
    await writeFile(CALIBRATION_PATH, calibrationSerialized);
    await writeFile(BASELINE_PATH, baselineSerialized);
  }

  process.stdout.write(
    `Scene calibration: ${separable.length} gating metrics, ${diagnostic.length} demoted to diagnostic; ` +
      `${SCENE_CONTROLS.length} scene, ${GEOGRAPHY_CONTROLS.length} geography, ${HORIZON_CONTROLS.length} horizon controls\n`,
  );
  for (const metric of diagnostic) {
    process.stdout.write(`  diagnostic: ${metric.name} — ${metric.calibration.reason}\n`);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
