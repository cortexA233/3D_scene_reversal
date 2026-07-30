/**
 * The metrics the two rendered gate layers gate, and how their thresholds are
 * chosen.
 *
 * Every path is rooted at the gate stack's own evidence object, whose `passes`
 * key holds `scene-pass-evidence-v1`, so a frozen threshold is read by exactly the
 * expression acceptance evaluates. Rooting these at `aggregate` instead — correct
 * against the passes file on its own — made every metric report "evidence is
 * missing" through the stack while a check that read the file directly stayed
 * green. Every metric is per-group
 * or per-family rather than whole-frame: geography fills 84 to 86 per cent of
 * each auxiliary frame, so a whole-frame number is mostly ground agreeing with
 * ground. Whole-frame silhouette IoU reads 0.994 on the current candidate while
 * its per-group IoU is 0.422, and whole-frame contour distance p95 reads 0 or 1
 * pixel on five of the six cameras. Neither is island evidence, and neither is
 * gated here.
 *
 * Threshold selection is `selectThreshold`, unchanged: a threshold sits between
 * the worst mild result and the best result from the damage that metric is
 * declared to detect, and a metric that cannot separate the two is demoted to
 * diagnostic rather than loosened until both pass.
 */

import { buildLayer, selectThreshold } from "./scene-calibration.mjs";

export const FIXED_CAMERA_CALIBRATION_SCHEMA = "fixed-camera-calibration-v1";

const read = (source, dotted) =>
  dotted.split(".").reduce((value, key) => (value == null ? value : value[key]), source);

function metric({ name, scope, path, direction }) {
  return { name, scope, path, direction, select: (report) => read(report, path) };
}

export const FIXED_CAMERA_METRICS = Object.freeze([
  metric({
    name: "group silhouette IoU",
    scope: "aggregate",
    path: "passes.aggregate.groupSilhouetteIoU.mean",
    direction: "atLeast",
  }),
  metric({
    name: "worst group silhouette IoU",
    scope: "worst-group",
    path: "passes.aggregate.groupSilhouetteIoU.worst.value",
    direction: "atLeast",
  }),
  metric({
    name: "group contour distance p95",
    scope: "aggregate",
    path: "passes.aggregate.groupContourDistance.meanP95",
    direction: "atMost",
  }),
  metric({
    name: "worst group contour distance",
    scope: "worst-group",
    path: "passes.aggregate.groupContourDistance.worst.value",
    direction: "atMost",
  }),
  metric({
    name: "group depth p95",
    scope: "aggregate",
    path: "passes.aggregate.groupDepthWorldUnits.meanP95",
    direction: "atMost",
  }),
  metric({
    name: "worst group depth p95",
    scope: "worst-group",
    path: "passes.aggregate.groupDepthWorldUnits.worst.value",
    direction: "atMost",
  }),
  metric({
    name: "group world normal p95",
    scope: "aggregate",
    path: "passes.aggregate.groupWorldNormalDegrees.meanP95",
    direction: "atMost",
  }),
  metric({
    name: "worst group world normal p95",
    scope: "worst-group",
    path: "passes.aggregate.groupWorldNormalDegrees.worst.value",
    direction: "atMost",
  }),
  metric({
    name: "semantic agreement",
    scope: "aggregate",
    path: "passes.aggregate.semanticAgreement.mean",
    direction: "atLeast",
  }),
  metric({
    name: "worst camera semantic agreement",
    scope: "worst-camera",
    path: "passes.aggregate.semanticAgreement.worst.value",
    direction: "atLeast",
  }),
  metric({
    name: "worst semantic confusion fraction",
    scope: "worst-transition",
    path: "passes.aggregate.semanticConfusion.worstFraction",
    direction: "atMost",
  }),
]);

export const NATIVE_APPEARANCE_METRICS = Object.freeze([
  metric({
    name: "appearance DeltaE mean",
    scope: "aggregate",
    path: "passes.aggregate.appearanceDeltaE.meanMean",
    direction: "atMost",
  }),
  metric({
    name: "worst camera appearance DeltaE",
    scope: "worst-camera",
    path: "passes.aggregate.appearanceDeltaE.worst.value",
    direction: "atMost",
  }),
  metric({
    name: "material family appearance DeltaE mean",
    scope: "aggregate",
    path: "passes.aggregate.appearanceByMaterialFamily.meanMean",
    direction: "atMost",
  }),
  metric({
    name: "worst material family appearance DeltaE",
    scope: "worst-material-family",
    path: "passes.aggregate.appearanceByMaterialFamily.worst.value",
    direction: "atMost",
  }),
]);

export const CALIBRATED_LAYERS = Object.freeze({
  fixedCameraGeometry: FIXED_CAMERA_METRICS,
  nativeAppearance: NATIVE_APPEARANCE_METRICS,
});

/**
 * Mild samples come from every identity and mild control; damage samples come
 * only from the severe controls that declare this metric.
 *
 * This is the same rule `run-scene-calibration.mjs` applies to the world-space
 * layers, and for the same reason: a control is responsible for the failure it
 * targets, not for every metric in the stack. Recolouring one Material Family is
 * not supposed to move the depth metric, and demanding that it did would demote
 * the whole bracket to diagnostic.
 *
 * A control that measured nothing for a metric — a geometry control has no lit
 * capture, an appearance control has no depth pass — contributes no sample, which
 * is why the reads are finiteness-checked rather than assumed.
 */
function collect(rows, definition) {
  const mild = [];
  const severe = [];
  const detectedControls = [];
  for (const row of rows) {
    const value = definition.select(row.report);
    if (!Number.isFinite(value)) continue;
    if (row.class === "identity" || row.class === "mild") mild.push(value);
    else if (row.class === "severe" && row.detects?.includes(definition.name)) {
      severe.push(value);
      detectedControls.push(row.id);
    }
  }
  return { mild, severe, detectedControls };
}

export function calibrateMetric(rows, definition, layer) {
  const { mild, severe, detectedControls } = collect(rows, definition);
  return {
    layer,
    name: definition.name,
    scope: definition.scope,
    path: definition.path,
    direction: definition.direction,
    detectedControls,
    samples: { mild, severe },
    calibration: selectThreshold({ mild, severe, direction: definition.direction }),
  };
}

export function buildCalibratedLayers(rows) {
  const metrics = [];
  const layers = {};
  const diagnostic = [];
  for (const [layer, definitions] of Object.entries(CALIBRATED_LAYERS)) {
    const calibrated = definitions.map((definition) =>
      calibrateMetric(rows, definition, layer),
    );
    metrics.push(...calibrated);
    const built = buildLayer(calibrated);
    layers[layer] = built.gating;
    diagnostic.push(...built.diagnostic.map((entry) => ({ layer, ...entry })));
  }
  return { layers, metrics, diagnostic };
}
