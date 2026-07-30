/**
 * Scene Quality Baseline calibration.
 *
 * Thresholds come from repeat reference evidence and declared reference-only
 * perturbations, never from the candidate. Each metric must separate declared
 * mild variation from declared structural or appearance damage; a metric that
 * cannot separate the two is demoted to diagnostic rather than loosened until
 * both pass.
 *
 * Nothing in this module reads a candidate observation, a candidate report, or
 * any file the candidate produced.
 */

export const CALIBRATION_SCHEMA = "scene-calibration-v1";
export const BASELINE_SCHEMA = "scene-quality-baseline-v1";

export const CONTROL_CLASSES = Object.freeze(["identity", "mild", "intermediate", "severe"]);

/**
 * A threshold sits strictly between the worst mild result and the best severe
 * result, with a margin proportional to the gap. Placing it at either endpoint
 * would make the bracket's own controls marginal.
 */
export const THRESHOLD_MARGIN = 0.25;

function worst(values, direction) {
  return direction === "atMost" ? Math.max(...values) : Math.min(...values);
}

function best(values, direction) {
  return direction === "atMost" ? Math.min(...values) : Math.max(...values);
}

/**
 * A metric is calibrated against the damage it is meant to detect, not against
 * every declared control. Deleting a building is caught by the missing-entity
 * metric, not by the orientation metric, and demanding that every control trip
 * every metric would demote the whole bracket to diagnostic.
 *
 * Separately, every severe control must be caught by at least one gating
 * metric; `undetectedControls` is what enforces that.
 *
 * @param {object} options
 * @param {number[]} options.mild results from identity and mild controls
 * @param {number[]} options.severe results from the damage this metric detects
 * @param {"atMost"|"atLeast"} options.direction which way is good
 */
export function selectThreshold({ mild, severe, direction, exact = false }) {
  if (mild.length === 0) {
    return { separable: false, reason: "no mild control produced a result", threshold: null };
  }
  if (severe.length === 0) {
    return {
      separable: false,
      reason: "no declared damage control targets this metric, so it cannot gate",
      threshold: null,
    };
  }
  const mildWorst = worst(mild, direction);
  const severeBest = best(severe, direction);
  if (exact) {
    // Semantic identity is not a tolerance. One missing or duplicated entity is
    // a structural failure, so the only defensible limit is zero — calibration
    // still has to prove the declared damage actually trips it.
    if (mildWorst !== 0) {
      return {
        separable: false,
        reason: `an exact metric must be zero under every mild control, but reached ${mildWorst}`,
        threshold: null,
      };
    }
    if (severeBest === 0) {
      return {
        separable: false,
        reason: "declared damage did not move this exact metric away from zero",
        threshold: null,
      };
    }
    return { separable: true, threshold: 0, exact: true, mildWorst, severeBest };
  }
  const separable =
    direction === "atMost" ? mildWorst < severeBest : mildWorst > severeBest;
  if (!separable) {
    return {
      separable: false,
      reason: `mild reaches ${mildWorst} while damage reaches ${severeBest}, so this metric cannot tell them apart`,
      threshold: null,
      mildWorst,
      severeBest,
    };
  }
  const gap = Math.abs(severeBest - mildWorst);
  const threshold =
    direction === "atMost"
      ? mildWorst + gap * THRESHOLD_MARGIN
      : mildWorst - gap * THRESHOLD_MARGIN;
  return {
    separable: true,
    threshold: Number(threshold.toFixed(6)),
    mildWorst: Number(mildWorst.toFixed(6)),
    severeBest: Number(severeBest.toFixed(6)),
    margin: THRESHOLD_MARGIN,
  };
}

/**
 * Builds one baseline layer from calibrated metrics. A metric that failed to
 * separate its bracket is recorded as diagnostic and does not gate.
 */
export function buildLayer(metrics) {
  const gating = [];
  const diagnostic = [];
  for (const metric of metrics) {
    if (metric.calibration.separable) {
      gating.push({
        name: metric.name,
        scope: metric.scope,
        path: metric.path,
        direction: metric.direction,
        threshold: metric.calibration.threshold,
      });
    } else {
      diagnostic.push({
        name: metric.name,
        scope: metric.scope,
        path: metric.path,
        reason: metric.calibration.reason,
      });
    }
  }
  return { gating, diagnostic };
}

/**
 * Proves the calibration inputs contain nothing the candidate produced. The
 * check is on the declared input graph, so adding a candidate file later fails
 * here rather than quietly moving a threshold.
 */
export const CANDIDATE_ARTIFACT_PATTERN =
  /(candidate|scene-correspondence|scene-passes|scene-parity-report|geography-evidence|horizon-evidence)/i;

/**
 * Every declared damage control must be caught by at least one gating metric.
 * A control nothing detects is a hole in the bracket, not a passing result.
 */
export function undetectedControls({ controls, metrics }) {
  const caught = new Set();
  for (const metric of metrics) {
    if (!metric.calibration.separable) continue;
    for (const control of metric.detectedControls ?? []) caught.add(control);
  }
  return controls
    .filter((control) => control.class === "severe" && !caught.has(control.id))
    .map((control) => control.id);
}

export function verifyCalibrationInputs(inputPaths) {
  return inputPaths
    .filter((inputPath) => CANDIDATE_ARTIFACT_PATTERN.test(inputPath))
    .map((inputPath) => `${inputPath} is a candidate-derived artifact and cannot calibrate a threshold`);
}
