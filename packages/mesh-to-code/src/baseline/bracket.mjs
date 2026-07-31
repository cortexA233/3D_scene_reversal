import { GEOMETRY_METRIC_DIRECTION } from "./direction.mjs";
import { METRIC_GROUPS, generatePerturbationManifest } from "./perturbations.mjs";
import {
  bakeToEvaluationSpace,
  CANONICAL_MAX_DIMENSION,
  computeVertexNormals,
  createReferenceBufferCache,
  scoreCandidateGeometry,
  stagePoses,
} from "../rasterizer/index.mjs";
import { meshBounds } from "../geometry/mesh.mjs";

/**
 * The Calibration Bracket, executed rather than judged.
 *
 * A metric is eligible as a hard gate only when it separates the declared mild
 * perturbations from the declared destructive controls. A metric that cannot
 * separate them becomes diagnostic. It is never loosened until both pass — that
 * is the whole point of the rule, and here it is a computed verdict rather than a
 * human call.
 *
 * The bracket runs reference-only. Nothing in this module reads a candidate, and
 * the fitting entry point cannot run until the resulting baseline has been frozen.
 */

/** Fraction of the mild-to-destructive interval given up as repeatability guard. */
export const GUARD_FRACTION = 0.25;

function scoreVariant({ referenceCache, referenceBounds, variantMesh, framing, stageId }) {
  const baked = bakeToEvaluationSpace({
    positions: variantMesh.positions,
    indices: variantMesh.indices,
    transform: framing.referenceTransform,
  });
  baked.normals = computeVertexNormals(baked);
  return scoreCandidateGeometry({
    referenceCache,
    referenceBounds,
    candidateGeometry: baked,
    candidateBounds: meshBounds(baked.positions ? { positions: baked.positions } : baked),
    stageId,
    canonicalMaxDimension: CANONICAL_MAX_DIMENSION,
  }).aggregate;
}

function getMetric(aggregate, path) {
  return path.split(".").reduce((value, key) => value?.[key], aggregate);
}

/**
 * Run the bracket on one reference.
 *
 * @param {object} input
 * @param {object} input.mesh the Authored Reference in source-world coordinates
 * @param {string} [input.stageId] the resolution stage to measure at
 */
export function runCalibrationBracket({ mesh, stageId = "final" }) {
  const manifest = generatePerturbationManifest({ mesh });
  const worldBounds = meshBounds(mesh);
  const { framing } = stagePoses({ referenceWorldBounds: worldBounds, stageId });

  const referenceGeometry = bakeToEvaluationSpace({
    positions: mesh.positions,
    indices: mesh.indices,
    transform: framing.referenceTransform,
  });
  referenceGeometry.normals = computeVertexNormals(referenceGeometry);
  const referenceBounds = meshBounds({ positions: referenceGeometry.positions });
  const referenceCache = createReferenceBufferCache({
    geometry: referenceGeometry,
    referenceWorldBounds: worldBounds,
  });

  // Identity: the reference against itself. Any non-zero result here is
  // measurement noise, and it bounds how tight a threshold can honestly be.
  const identity = scoreVariant({
    referenceCache,
    referenceBounds,
    variantMesh: mesh,
    framing,
    stageId,
  });

  const scored = [];
  for (const control of manifest.controls) {
    if (!control.applicable || control.mesh === null) {
      scored.push({ ...control, mesh: undefined, aggregate: null });
      continue;
    }
    scored.push({
      ...control,
      mesh: undefined,
      aggregate: scoreVariant({
        referenceCache,
        referenceBounds,
        variantMesh: control.mesh,
        framing,
        stageId,
      }),
    });
  }

  const metrics = {};
  for (const [metricPath, group] of Object.entries(METRIC_GROUPS)) {
    const direction = GEOMETRY_METRIC_DIRECTION[metricPath];
    const better = direction === ">=" ? Math.max : Math.min;
    const worse = direction === ">=" ? Math.min : Math.max;

    // A mild control must be tolerated by every geometry metric; a destructive
    // control is only judged against the metrics it names as responsible for
    // rejecting it.
    const applicable = scored.filter(
      (control) =>
        control.domain === "geometry" &&
        control.aggregate !== null &&
        control.metrics.includes(metricPath),
    );
    const mild = applicable.filter((control) => control.kind === "mild");
    const destructive = applicable.filter((control) => control.kind === "destructive");

    const identityValue = getMetric(identity, metricPath);
    const mildValues = mild.map((control) => ({
      id: control.id,
      value: getMetric(control.aggregate, metricPath),
    }));
    const destructiveValues = destructive.map((control) => ({
      id: control.id,
      value: getMetric(control.aggregate, metricPath),
    }));

    if (mildValues.length === 0 || destructiveValues.length === 0) {
      metrics[metricPath] = {
        group,
        direction,
        eligibility: "diagnostic",
        reason:
          mildValues.length === 0
            ? "no applicable mild control names this metric"
            : "every destructive control naming this metric was inapplicable to this mesh, so separation cannot be demonstrated and the metric is diagnostic",
        identityValue,
        mildEnvelope: null,
        destructiveBoundary: null,
        threshold: null,
        mildValues,
        destructiveValues,
      };
      continue;
    }

    // The mild envelope is the worst a mild perturbation gets; the destructive
    // boundary is the best a destructive control gets. They must not overlap.
    const mildEnvelope = worse(...mildValues.map((entry) => entry.value));
    const destructiveBoundary = better(...destructiveValues.map((entry) => entry.value));
    const separable =
      direction === ">="
        ? mildEnvelope > destructiveBoundary
        : mildEnvelope < destructiveBoundary;

    const threshold = separable
      ? direction === ">="
        ? mildEnvelope - (mildEnvelope - destructiveBoundary) * GUARD_FRACTION
        : mildEnvelope + (destructiveBoundary - mildEnvelope) * GUARD_FRACTION
      : null;

    metrics[metricPath] = {
      group,
      direction,
      eligibility: separable ? "hard" : "diagnostic",
      reason: separable
        ? "declared mild perturbations pass and declared destructive controls fail"
        : "the mild envelope and the destructive boundary overlap, so this metric cannot separate them and is diagnostic rather than loosened",
      identityValue,
      mildEnvelope,
      destructiveBoundary,
      guardFraction: GUARD_FRACTION,
      threshold,
      mildValues,
      destructiveValues,
    };
  }

  return {
    manifestVersion: manifest.version,
    stageId,
    candidatePresent: false,
    identity,
    controls: scored.map((control) => ({
      id: control.id,
      kind: control.kind,
      level: control.level,
      domain: control.domain,
      metrics: control.metrics,
      applicable: control.applicable,
      notApplicableReason: control.notApplicableReason,
      metadata: control.metadata,
      appearance: control.appearance,
    })),
    metrics,
    appearanceDomain: {
      controlsGenerated: scored
        .filter((control) => control.domain === "appearance")
        .map((control) => control.id),
      eligibilityEvaluated: false,
      reason:
        "the L1 stack scores geometry only, because a Bounded Semantic Pattern Program executes as a shader. Appearance controls are generated and recorded; no appearance metric is declared hard or diagnostic here.",
    },
  };
}
