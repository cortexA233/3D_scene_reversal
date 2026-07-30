import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import {
  coveredLayers,
  materialFamilyIds,
  requiredCoverage,
  verifyLayerCoverage,
} from "../tools/acceptance/camera-appearance-layers.mjs";
import { evaluateSceneParityGateStack } from "../tools/acceptance/scene-parity-gates.mjs";
import {
  undetectedControls,
  verifyCalibrationInputs,
} from "../tools/evaluation/scene-calibration.mjs";
import { SCENE_GRAPH_CONTROLS } from "../tools/evaluation/scene-graph-perturbations.mjs";
import { loadBaseline, loadEvidence } from "../scripts/run-scene-parity-report.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const readJson = (relative) =>
  readFile(path.join(PROJECT_ROOT, relative), "utf8").then(JSON.parse);

const EVIDENCE = ".scratch/scene-parity-foundation/evidence";
const BASELINE = "tools/acceptance/baselines/scene-quality-baseline-v1.json";

/**
 * The calibration evidence may be absent, which is a state this check has to
 * report as a missing calibration rather than crash on. Before ticket 01 ran,
 * absent was the whole finding.
 */
const fixedCamera = await readJson(`${EVIDENCE}/fixed-camera-calibration-v1.json`).catch(
  () => null,
);
const requireFixedCamera = () => {
  assert.ok(
    fixedCamera,
    "fixed-camera-calibration-v1.json does not exist, so the two rendered layers have " +
      "never been calibrated against declared damage",
  );
  return fixedCamera;
};

// Frozen by Foundation ticket 10 and unchanged by this migration. Recorded here
// so extending the baseline cannot quietly move a geometry threshold.
const FROZEN_GEOMETRY_THRESHOLDS = {
  "surface p95": 2.3479,
  "worst entity surface p95": 13.758675,
  "over-tolerance surface fraction": 0.11835,
  "worst neighbourhood distance error": 12.990425,
  "worst zone occupancy delta": 5.25,
  "worst component deficit": 3.5,
  "terrain height p95": 5.26875,
  "shore height p95": 2.85035,
  "coastline symmetric p95": 22.02965,
  "coastline area error": 0.105515,
  "land and sea agreement": 0.931361,
  "horizon profile p95": 0.0165,
  "worst azimuth horizon error": 0.0165,
};

test("the two camera and appearance layers carry frozen thresholds", async () => {
  const baseline = await readJson(BASELINE);

  for (const layer of coveredLayers()) {
    const thresholds = baseline.layers[layer];
    assert.ok(
      Array.isArray(thresholds) && thresholds.length > 0,
      `${layer} has no frozen thresholds, so the gate stack cannot express a pass ` +
        "for it and every appearance ticket stays blocked",
    );
  }
});

test("each layer gates every required metric family", async () => {
  const baseline = await readJson(BASELINE);

  for (const layer of coveredLayers()) {
    const { unexplained, uncoveredFamilies } = verifyLayerCoverage({
      layer,
      thresholds: baseline.layers[layer],
      diagnostic: baseline.diagnostic ?? [],
    });
    assert.deepEqual(
      uncoveredFamilies,
      [],
      `${layer} leaves these metric families ungated: ${uncoveredFamilies.join(", ")}`,
    );
    // A required path may be demoted, because the ticket requires demoting a
    // metric that cannot separate its bracket rather than loosening it. What it
    // may not be is unaccounted for: every path that does not gate has to carry a
    // measured reason, or a calibration could freeze whichever metrics happened to
    // separate and stay silent about the rest.
    assert.deepEqual(
      unexplained,
      [],
      `${layer} neither gates nor explains: ${unexplained.join(", ")}`,
    );
  }
});

test("every required metric keeps an aggregate and a worst case", () => {
  for (const layer of coveredLayers()) {
    const byFamily = new Map();
    for (const entry of requiredCoverage(layer)) {
      byFamily.set(entry.family, [...(byFamily.get(entry.family) ?? []), entry.path]);
    }
    for (const [family, paths] of byFamily) {
      // Semantic confusion is inherently a worst-case fraction; every other
      // family must gate its aggregate and its worst case separately, so a good
      // average cannot hide a failed camera or group.
      if (family === "semantic confusion") continue;
      assert.ok(
        paths.some((entry) => /worst/.test(entry)),
        `${layer}/${family} gates no worst case`,
      );
      assert.ok(
        paths.some((entry) => !/worst/.test(entry)),
        `${layer}/${family} gates no aggregate`,
      );
    }
  }
});

test("coverage tells a demoted metric apart from an unmeasured one", () => {
  const layer = "nativeAppearance";
  const [first, ...rest] = requiredCoverage(layer);
  const thresholds = rest.map((entry) => ({ path: entry.path }));

  // Not gated and not explained: nothing was measured for it, and a calibration
  // that froze only the metrics that happened to separate would look like this.
  const silent = verifyLayerCoverage({ layer, thresholds, diagnostic: [] });
  assert.deepEqual(silent.unexplained, [first.path]);

  // Not gated but demoted with a measured reason: allowed, and still reported as
  // missing so the demotion stays visible.
  const demoted = verifyLayerCoverage({
    layer,
    thresholds,
    diagnostic: [
      { layer, path: first.path, reason: "mild reaches 3 while damage reaches 2" },
    ],
  });
  assert.deepEqual(demoted.unexplained, []);
  assert.deepEqual(demoted.missing, [first.path]);
  assert.deepEqual(demoted.uncoveredFamilies, []);

  // A family whose every member is demoted is a family nothing gates, and that
  // has to surface however well each demotion is explained.
  const everything = verifyLayerCoverage({
    layer,
    thresholds: [],
    diagnostic: requiredCoverage(layer).map((entry) => ({
      layer,
      path: entry.path,
      reason: "cannot separate its bracket",
    })),
  });
  assert.deepEqual(everything.unexplained, []);
  assert.ok(everything.uncoveredFamilies.length > 0);
});

test("the passes evidence supplies every path the two layers gate", async () => {
  // Read through the gate stack's own evidence loader, not by opening the pass
  // file. A path is only useful if it resolves for the code that will evaluate it:
  // paths rooted at `aggregate` resolve against the pass file alone and resolve to
  // nothing through the stack, and a check that opened the file directly reported
  // all fifteen as present while acceptance reported all fifteen as missing.
  const evidence = await loadEvidence();
  const read = (source, dotted) =>
    dotted.split(".").reduce((value, key) => (value == null ? value : value[key]), source);

  const absent = [];
  for (const layer of coveredLayers()) {
    for (const entry of requiredCoverage(layer)) {
      if (!Number.isFinite(read(evidence, entry.path))) absent.push(entry.path);
    }
  }
  assert.deepEqual(
    absent,
    [],
    `the scene passes do not measure: ${absent.join(", ")}`,
  );
});

test("acceptance can actually read every threshold it froze", async () => {
  // The end-to-end form of the check above: evaluate the real stack against the
  // real evidence and assert no gated metric came back as missing. A threshold
  // whose path acceptance cannot resolve is worse than no threshold, because the
  // layer fails for a reason that has nothing to do with the candidate.
  const evidence = await loadEvidence();
  const baseline = await loadBaseline();
  const stack = evaluateSceneParityGateStack({ evidence, baseline });

  for (const layer of coveredLayers()) {
    const unreadable = (stack.layers[layer].metrics ?? [])
      .filter((metric) => metric.missing)
      .map((metric) => metric.name);
    // `nativeAppearance` is legitimately unevaluated while geometry fails, so it
    // reports no metrics at all; that is the ordering rule, not a missing path.
    if (!stack.layers[layer].evaluated) continue;
    assert.deepEqual(
      unreadable,
      [],
      `${layer} froze thresholds acceptance cannot read: ${unreadable.join(", ")}`,
    );
  }
  assert.equal(stack.layers.fixedCameraGeometry.evaluated, true);
});

test("appearance is measured for every declared Material Family", async () => {
  const passes = await readJson(`${EVIDENCE}/scene-passes-v1.json`);
  const declared = materialFamilyIds(ISLAND_SCENE_RECIPE);

  // Per camera rather than per family: a family outside a camera's frame cannot
  // be measured there and must not be demanded. `distant-rock` is the horizon
  // backdrop, which the top-down camera does not frame now that ADR-0049 points
  // it at the island. What may not happen is a family no camera measures at all,
  // because that is a material nothing gates.
  const unmeasured = declared.filter(
    (family) =>
      !passes.views.some((view) => view.appearance?.materialFamilies?.[family]),
  );
  assert.deepEqual(
    unmeasured,
    [],
    `no camera measures appearance for: ${unmeasured.join(", ")}`,
  );

  for (const view of passes.views) {
    const measured = Object.keys(view.appearance?.materialFamilies ?? {});
    assert.ok(
      measured.length > 0,
      `${view.camera} measures no material families at all`,
    );
    for (const family of measured) {
      assert.ok(
        declared.includes(family),
        `${view.camera} reports ${family}, which the recipe does not declare`,
      );
    }
  }
});

test("no layer is unevaluated for want of calibration", async () => {
  const report = await readJson(`${EVIDENCE}/scene-parity-report-v1.json`);

  // ADR-0040 defers native appearance until every geometry layer passes, so an
  // unevaluated appearance layer is legitimate while the candidate is red. What
  // is not legitimate is a layer that cannot be evaluated because nothing was
  // ever calibrated for it. Those two reasons are distinguished here so
  // calibrating the layers is not confused with the stack's ordering rule.
  const uncalibrated = Object.entries(report.layers)
    .filter(([, layer]) => /no frozen thresholds/.test(layer.reason ?? ""))
    .map(([name]) => name);
  assert.deepEqual(
    uncalibrated,
    [],
    `these layers cannot be evaluated at all: ${uncalibrated.join(", ")}`,
  );

  const deferred = Object.entries(report.layers).filter(
    ([, layer]) => layer.evaluated !== true,
  );
  for (const [name, layer] of deferred) {
    assert.ok(
      Array.isArray(layer.blockedBy) && layer.blockedBy.length > 0,
      `${name} is unevaluated without naming the layer that blocks it`,
    );
  }
});

test("extending the baseline leaves every geometry threshold untouched", async () => {
  const baseline = await readJson(BASELINE);
  const actual = Object.fromEntries(
    [...baseline.layers.worldGeometry].map((entry) => [entry.name, entry.threshold]),
  );
  assert.deepEqual(
    actual,
    FROZEN_GEOMETRY_THRESHOLDS,
    "the world-geometry thresholds moved; this migration may only add layers",
  );
});

test("the rendered layers are calibrated from scene-space damage, not image-space", async () => {
  const calibration = requireFixedCamera();

  // Every declared control has to have been rendered. A bracket assembled from
  // whichever controls happened to finish is not a bracket.
  const measured = new Set(calibration.controls.map((control) => control.id));
  assert.deepEqual(
    SCENE_GRAPH_CONTROLS.filter((control) => !measured.has(control.id)).map(
      (control) => control.id,
    ),
    [],
    "these declared controls were never rendered",
  );

  // Scene-space damage has to be undone, and an image-space approximation would
  // have nothing to undo. Each capture proves its restore twice: numerically
  // against a snapshot of every world matrix, visibility flag, and material
  // colour it touched, and by re-rendering a frame and comparing it byte for byte
  // with the undamaged one.
  for (const control of SCENE_GRAPH_CONTROLS) {
    const partial = await readJson(
      `${EVIDENCE}/fixed-camera-controls/${control.id}.json`,
    );
    assert.equal(partial.mutation.declared, true, `${control.id}: damage is not declared`);
    assert.deepEqual(
      partial.mutation.restoreFailures,
      [],
      `${control.id}: the reference was not restored cleanly`,
    );
    assert.equal(
      partial.mutation.restoredFrameIdentical,
      true,
      `${control.id}: the frame re-captured after restoring differs from the undamaged one`,
    );
    assert.equal(
      partial.protocol.length,
      6,
      `${control.id}: damage was not rendered through all six frozen cameras`,
    );
  }
});

test("every declared damage control is caught by at least one gating metric", () => {
  const calibration = requireFixedCamera();
  assert.deepEqual(
    undetectedControls({ controls: SCENE_GRAPH_CONTROLS, metrics: calibration.metrics }),
    [],
    "a declared damage control that no gating metric detects is a hole in the bracket",
  );
});

test("each gating metric separates its own bracket in both directions", () => {
  const calibration = requireFixedCamera();
  const gating = calibration.metrics.filter((metric) => metric.calibration.separable);
  assert.ok(gating.length > 0, "no metric was calibrated at all");

  const passes = (metric, value) =>
    metric.direction === "atMost"
      ? value <= metric.calibration.threshold
      : value >= metric.calibration.threshold;

  for (const metric of gating) {
    assert.ok(
      metric.samples.mild.length > 0 && metric.samples.severe.length > 0,
      `${metric.name} was frozen without samples on both sides of its bracket`,
    );
    for (const value of metric.samples.mild) {
      assert.ok(
        passes(metric, value),
        `${metric.name}: mild control result ${value} fails its own threshold ${metric.calibration.threshold}`,
      );
    }
    for (const value of metric.samples.severe) {
      assert.ok(
        !passes(metric, value),
        `${metric.name}: declared damage result ${value} still passes ${metric.calibration.threshold}`,
      );
    }
  }
});

test("a metric that cannot separate its bracket is demoted rather than loosened", async () => {
  const calibration = requireFixedCamera();
  const baseline = await readJson(BASELINE);
  for (const metric of calibration.metrics) {
    if (metric.calibration.separable) continue;
    assert.equal(
      metric.calibration.threshold,
      null,
      `${metric.name} did not separate its bracket but still carries a threshold`,
    );
    assert.ok(
      typeof metric.calibration.reason === "string" && metric.calibration.reason.length > 0,
      `${metric.name} was demoted without recording why`,
    );
    assert.ok(
      !(baseline.layers[metric.layer] ?? []).some((entry) => entry.name === metric.name),
      `${metric.name} was demoted yet still gates in ${metric.layer}`,
    );
  }
});

test("the calibration input graph contains no candidate artifact", () => {
  const calibration = requireFixedCamera();
  assert.deepEqual(calibration.candidateArtifactsRead, []);
  assert.deepEqual(verifyCalibrationInputs(calibration.inputs), []);

  // The strong form of the claim: what the calibration page actually fetched.
  // The Scene Generation Module is what turns a Scene Recipe into the candidate,
  // so a page that loaded it had the candidate available and its thresholds are
  // not reference-only. The recipe itself is reference-measured input and is
  // expected here.
  const loaded = calibration.modulesLoadedByTheCalibrationPage;
  assert.ok(Array.isArray(loaded) && loaded.length > 0, "no module graph was recorded");
  const candidateModules = loaded.filter((module) =>
    /(scene-generator|object-generator|environment-recipe)/i.test(module),
  );
  assert.deepEqual(
    candidateModules,
    [],
    `the calibration page loaded candidate modules: ${candidateModules.join(", ")}`,
  );
});

test("extending the baseline is recorded as a versioned migration", async () => {
  const baseline = await readJson(BASELINE);

  // The shape stays v1, which is what the gate stack requires; the contents are a
  // named revision. Without this the two are conflated and a threshold change
  // becomes indistinguishable from a schema change.
  assert.equal(baseline.schemaVersion, "scene-quality-baseline-v1");
  assert.ok(
    Array.isArray(baseline.migrations) && baseline.migrations.length >= 2,
    "the baseline does not record how it got here",
  );
  const latest = baseline.migrations.at(-1);
  assert.equal(baseline.version, latest.version);
  assert.notEqual(baseline.version, "scene-quality-baseline-v1");
  assert.match(latest.adr, /^\d{4}$/, "a baseline revision must name its ADR");
  assert.deepEqual(
    latest.movedGeometryThresholds,
    [],
    "this revision may add layers and may not move a geometry threshold",
  );
});

test("an uncalibrated layer still refuses to pass vacuously", () => {
  const result = evaluateSceneParityGateStack({
    evidence: {},
    baseline: Object.freeze({
      schemaVersion: "scene-quality-baseline-v1",
      version: "fixture",
      layers: Object.freeze({
        structuralCorrespondence: [],
        worldGeometry: [],
        fixedCameraGeometry: [],
        nativeAppearance: [],
      }),
    }),
  });
  for (const layer of Object.values(result.layers)) {
    assert.equal(layer.evaluated, false);
    assert.equal(layer.passed, false);
  }
});
