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
  // The two rendered layers' thresholds, produced by
  // `run-fixed-camera-calibration.mjs` from declared scene-space damage to the
  // reference. It is a control result, not a candidate result: the calibration
  // page never loads the Scene Generation Module and records the modules it did
  // load so that claim is checkable.
  "fixed-camera-calibration-v1.json",
];

const FIXED_CAMERA_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence/fixed-camera-calibration-v1.json",
);

/**
 * The baseline's frozen revision, distinct from its schema version: the shape is
 * still `scene-quality-baseline-v1`, which is what the gate stack requires, while
 * the contents are the v1.1 revision. Every revision has to name itself here and
 * declare which existing thresholds it moved, so "we only added layers" is a
 * checkable statement rather than a claim in a commit message.
 */
const BASELINE_VERSION = "scene-quality-baseline-v1.2";

const BASELINE_MIGRATIONS = [
  {
    version: "scene-quality-baseline-v1",
    adr: "0040",
    change:
      "Freezes the structural-correspondence and world-geometry layers from reference repeatability and declared reference-only perturbations. The two rendered layers are left empty and therefore cannot pass.",
    movedGeometryThresholds: [],
    movedRenderedThresholds: [],
  },
  {
    version: "scene-quality-baseline-v1.1",
    adr: "0051",
    change:
      "Adds the fixedCameraGeometry and nativeAppearance thresholds, calibrated from declared scene-space damage rendered through the six frozen cameras of ADR-0049. Contour distance is gated per group rather than whole-frame, because whole-frame contour p95 measures 0 on topDown and 1 on the four obliques whatever the island looks like.",
    movedGeometryThresholds: [],
    movedRenderedThresholds: [],
  },
  {
    version: "scene-quality-baseline-v1.2",
    adr: "0053",
    change:
      "Re-derives the fixedCameraGeometry and nativeAppearance thresholds under the corrected pass encodings. Three encoding defects made the reference's own masks wrong: a per-instance colour that tinted the identity every mask pass wrote, depth and world-normal shaders that ignored instanceMatrix and rendered every instance on its mesh's origin, and an identity lattice that could not carry the fourteenth declared group. The reference is on both sides of every calibration control, so the previous thresholds were calibrated through the defect. No threshold is chosen and no candidate result is consulted: the controls, their damage magnitudes, and the selection rule are unchanged, and only what the passes measure has changed.",
    movedGeometryThresholds: [],
    // Measured, not chosen, and checked two ways: on the run that writes the file,
    // a threshold that moves without appearing here fails the run; on every run,
    // each entry's second value must be what the metric is actually frozen at. What
    // that cannot catch is a declaration deleted after the fact, because once the
    // file is written it no longer carries the previous revision's values — the same
    // limit the geometry list beside it has, and the reason each entry records both
    // numbers rather than only the fact that something changed.
    //
    // Read the direction of each move before reading the count. The two worst-case
    // metrics that a corrected mask makes discriminating again got *stricter* —
    // worst group silhouette IoU from 0.302569 to 0.369228, worst semantic
    // confusion from 0.007092 to 0.006534 — because the previous bracket was
    // measured through a reference whose scatter had been credited to `plazas`. The
    // three that loosened did so because the corrected passes measure more: cover's
    // world normals are rendered at all now, and cover's own rows join the depth
    // and IoU means. The four appearance moves are in the fourth decimal place.
    movedRenderedThresholds: [
      "fixedCameraGeometry/group silhouette IoU: 0.745598 -> 0.724931",
      "fixedCameraGeometry/worst group silhouette IoU: 0.302569 -> 0.369228",
      "fixedCameraGeometry/group contour distance p95: 5.874122 -> 6.536774",
      "fixedCameraGeometry/group depth p95: 7.644414 -> 8.173471",
      "fixedCameraGeometry/group world normal p95: 49.456982 -> 58.959694",
      "fixedCameraGeometry/semantic agreement: 0.987474 -> 0.987465",
      "fixedCameraGeometry/worst camera semantic agreement: 0.974085 -> 0.974068",
      "fixedCameraGeometry/worst semantic confusion fraction: 0.007092 -> 0.006534",
      "nativeAppearance/appearance DeltaE mean: 2.852463 -> 2.852472",
      "nativeAppearance/worst camera appearance DeltaE: 4.228213 -> 4.228226",
      "nativeAppearance/material family appearance DeltaE mean: 5.961796 -> 5.985232",
      "nativeAppearance/worst material family appearance DeltaE: 4.062021 -> 4.062392",
    ],
  },
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

  // The rendered layers' thresholds. Missing evidence fails here rather than
  // writing two empty layers: an empty layer is the defect this ticket exists to
  // remove, and silently reproducing it would be the worst outcome available.
  const fixedCamera = await readFile(FIXED_CAMERA_PATH, "utf8").then(JSON.parse).catch(() => {
    throw new Error(
      "fixed-camera-calibration-v1.json is missing; run " +
        "`node scripts/run-fixed-camera-calibration.mjs --control <ids>` for every declared " +
        "control and then `--aggregate`",
    );
  });
  assert.equal(fixedCamera.schemaVersion, "fixed-camera-calibration-v1");
  assert.deepEqual(
    fixedCamera.candidateArtifactsRead,
    [],
    "the fixed-camera calibration read a candidate artifact",
  );
  for (const layer of ["fixedCameraGeometry", "nativeAppearance"]) {
    assert.ok(
      Array.isArray(fixedCamera.layers?.[layer]) && fixedCamera.layers[layer].length > 0,
      `the fixed-camera calibration froze no thresholds for ${layer}`,
    );
  }

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
    version: BASELINE_VERSION,
    migrations: BASELINE_MIGRATIONS,
    calibratedFrom: [CALIBRATION_SCHEMA, fixedCamera.schemaVersion],
    note: "Calibrated from reference repeatability and declared reference-only perturbations before any candidate result was consulted. Changing a value requires an explicit migration and full recalibration.",
    knownProperties: [
      "Placement and surface limits are absolute world units, and the mild controls apply to every entity including the 1.4 km horizon groups, so those limits are dominated by the largest objects. A small entity can therefore pass a limit that is generous for its own scale. Scale-relative placement evidence is the declared next refinement.",
    ],
    layers: {
      structuralCorrespondence: structuralLayer.gating,
      worldGeometry: worldLayer.gating,
      // Fixed-camera and native-appearance limits are calibrated separately by
      // the browser control run, which renders declared reference-only damage
      // through the same six frozen cameras. They are read here rather than
      // recomputed, because they cost about an hour of SwiftShader time.
      fixedCameraGeometry: fixedCamera.layers.fixedCameraGeometry,
      nativeAppearance: fixedCamera.layers.nativeAppearance,
    },
    // Each demoted metric names its layer, so coverage can tell a path this layer
    // measured and demoted from one it never measured.
    diagnostic: [
      ...structuralLayer.diagnostic.map((entry) => ({
        layer: "structuralCorrespondence",
        ...entry,
      })),
      ...worldLayer.diagnostic.map((entry) => ({ layer: "worldGeometry", ...entry })),
      ...(fixedCamera.diagnostic ?? []),
    ],
  };

  // The migration may add layers and may not move an existing threshold. This is
  // asserted against the file on disk rather than trusted, because "only added
  // layers" is the whole licence under which this revision is allowed to exist.
  const previous = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
  const moved = [];
  for (const layer of ["structuralCorrespondence", "worldGeometry"]) {
    const before = new Map(
      (previous.layers?.[layer] ?? []).map((entry) => [entry.name, entry.threshold]),
    );
    for (const entry of baseline.layers[layer]) {
      if (before.has(entry.name) && before.get(entry.name) !== entry.threshold) {
        moved.push(`${layer}/${entry.name}: ${before.get(entry.name)} -> ${entry.threshold}`);
      }
    }
    for (const name of before.keys()) {
      if (!baseline.layers[layer].some((entry) => entry.name === name)) {
        moved.push(`${layer}/${name}: dropped`);
      }
    }
  }
  assert.deepEqual(
    moved,
    BASELINE_MIGRATIONS.at(-1).movedGeometryThresholds,
    "this migration moved a geometry threshold it did not declare",
  );

  // The same statement for the two rendered layers, which differ from the two above
  // in being allowed to move: they are re-derived from the reference-only controls
  // rather than hand-adjusted. A revision may move them, but only the ones it names,
  // and the diff lands in the artifact rather than having to be reconstructed from a
  // previous copy of the file.
  const movedRendered = [];
  for (const layer of ["fixedCameraGeometry", "nativeAppearance"]) {
    const before = new Map(
      (previous.layers?.[layer] ?? []).map((entry) => [entry.name, entry.threshold]),
    );
    for (const entry of baseline.layers[layer]) {
      if (before.has(entry.name) && before.get(entry.name) !== entry.threshold) {
        movedRendered.push(
          `${layer}/${entry.name}: ${before.get(entry.name)} -> ${entry.threshold}`,
        );
      }
    }
    for (const name of before.keys()) {
      if (!baseline.layers[layer].some((entry) => entry.name === name)) {
        movedRendered.push(`${layer}/${name}: dropped`);
      }
    }
  }
  // Two statements, because the file on disk is the *previous* revision only until
  // this command has written once. Comparing the computed diff to the declared list
  // for equality would therefore pass on the run that writes and fail on every run
  // after it, which is a check that only works once.
  //
  // What holds either way: nothing may move that was not declared, and every
  // declared move must name the value the metric actually ends up at.
  const declaredRendered = BASELINE_MIGRATIONS.at(-1).movedRenderedThresholds;
  assert.deepEqual(
    movedRendered.filter((entry) => !declaredRendered.includes(entry)),
    [],
    "this migration moved a rendered threshold it did not declare",
  );
  const misdeclared = [];
  for (const entry of declaredRendered) {
    const [path, values] = entry.split(": ");
    const [layer, name] = path.split("/");
    const after = values.split(" -> ")[1];
    const metric = baseline.layers[layer]?.find((candidate) => candidate.name === name);
    if (!metric) {
      misdeclared.push(`${entry} — ${layer}/${name} is not in the baseline`);
    } else if (String(metric.threshold) !== after) {
      misdeclared.push(`${entry} — the metric is actually at ${metric.threshold}`);
    }
  }
  assert.deepEqual(
    misdeclared,
    [],
    "a declared rendered-threshold move does not match the frozen value",
  );

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
