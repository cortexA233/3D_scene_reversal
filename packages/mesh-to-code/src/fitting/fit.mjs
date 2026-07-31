import { meshBounds } from "../geometry/mesh.mjs";
import {
  bakeToEvaluationSpace,
  CANONICAL_MAX_DIMENSION,
  computeVertexNormals,
  createReferenceBufferCache,
  scoreCandidateGeometry,
} from "../rasterizer/index.mjs";
import { stagePoses } from "../rasterizer/protocol.mjs";
import { chooseLatheResolution, extractAxialProfile } from "./profile.mjs";

/**
 * The fitting loop: L0 analytic measurements drive coarse search, then L1
 * CPU-rasterized geometry views drive refinement through the copied metric
 * functions. L2, the native cross-browser gate, is not reached here.
 *
 * Structure is not decided in this module — the operator arrives already chosen by
 * a Decision Point. Continuous parameters are what this owns, which is the
 * automation boundary: structure is invented inside the bounded Operator Library,
 * and continuous parameters belong to deterministic numerical fitting.
 */

export const COARSE_STAGE = "coarse";
export const REFINE_STAGE = "fine";
export const FINAL_STAGE = "final";

/** Per-candidate iteration cap, so the loop terminates on a hard bound. */
export const L1_ITERATION_CAP = 96;
/** Early stop when the best score stops improving by at least this much. */
export const L1_EPSILON = 1e-5;
export const L1_STALL_ROUNDS = 2;

/**
 * A single scalar objective the L1 loop descends. It is built from the copied
 * metric functions rather than beside them: silhouette agreement dominates, edge
 * distance and depth error break ties. This is a search objective, never an
 * acceptance threshold — nothing here can admit or reject a candidate.
 */
export function geometryObjective(aggregate) {
  const silhouette = aggregate.geometry.silhouette;
  const depth = aggregate.geometry.depth;
  const bounds = aggregate.geometry.bounds;
  return (
    (1 - silhouette.meanIou) * 4 +
    (1 - silhouette.worstViewIou) * 2 +
    silhouette.meanEdgeDistancePixels * 0.02 +
    (Number.isFinite(depth.mae) ? depth.mae : 1) * 2 +
    bounds.maxAxisRelativeError
  );
}

function scale(profile, factor) {
  return profile.map(([radius, height]) => [radius * factor, height]);
}

function adjustRing(profile, ring, delta) {
  return profile.map(([radius, height], index) =>
    index === ring ? [Math.max(0, radius + delta), height] : [radius, height],
  );
}

/**
 * Fit one part.
 *
 * @param {object} input
 * @param {object} input.operator the Contract Operator chosen by a Decision Point
 * @param {object} input.targetMesh the unit's geometry, in its Reconstruction Frame
 * @param {object} input.referenceWorldBounds framing comes from the reference alone
 * @param {number} input.triangleBudget from the Complexity Budget Formula
 */
export function fitPart({ operator, targetMesh, referenceWorldBounds, triangleBudget }) {
  const resolution = chooseLatheResolution({ mesh: targetMesh, triangleBudget });
  if (resolution.chosen === null) {
    return {
      fitted: false,
      failureClassification: "insufficient-budget",
      detail: resolution.reason,
    };
  }

  const { framing } = stagePoses({ referenceWorldBounds, stageId: FINAL_STAGE });
  const referenceGeometry = bakeToEvaluationSpace({
    positions: targetMesh.positions,
    indices: targetMesh.indices,
    transform: framing.referenceTransform,
  });
  referenceGeometry.normals = computeVertexNormals(referenceGeometry);
  const referenceBounds = meshBounds({ positions: referenceGeometry.positions });
  const referenceCache = createReferenceBufferCache({
    geometry: referenceGeometry,
    referenceWorldBounds,
  });

  const scoreAt = (parameters, stageId) => {
    const built = operator.build(parameters);
    const baked = bakeToEvaluationSpace({
      positions: Float64Array.from(built.positions),
      indices: built.indices,
      transform: framing.replacementTransform,
    });
    baked.normals = computeVertexNormals(baked);
    const scored = scoreCandidateGeometry({
      referenceCache,
      referenceBounds,
      candidateGeometry: baked,
      candidateBounds: meshBounds({ positions: baked.positions }),
      stageId,
      canonicalMaxDimension: CANONICAL_MAX_DIMENSION,
    });
    return { built, scored, objective: geometryObjective(scored.aggregate) };
  };

  // L0: the analytic profile at the chosen resolution.
  const l0 = extractAxialProfile({ mesh: targetMesh, ringCount: resolution.chosen.ringCount });
  let parameters = {
    profile: l0.profile,
    radialSegments: resolution.chosen.radialSegments,
  };
  let iterations = 0;
  let best = scoreAt(parameters, COARSE_STAGE);
  const trace = [{ stage: "l0", objective: best.objective }];

  // L1: bounded coordinate descent. A global radius scale first, because it moves
  // the objective most, then one pass per ring.
  const longest = Math.max(...meshBounds(targetMesh).size) || 1;
  const ringStep = longest * 0.01;
  let stalled = 0;

  for (const factor of [0.98, 0.99, 1.01, 1.02]) {
    if (iterations >= L1_ITERATION_CAP) break;
    iterations += 1;
    const candidate = { ...parameters, profile: scale(parameters.profile, factor) };
    const scored = scoreAt(candidate, COARSE_STAGE);
    if (scored.objective < best.objective - L1_EPSILON) {
      best = scored;
      parameters = candidate;
      trace.push({ stage: "l1-global-scale", factor, objective: scored.objective });
    }
  }

  for (let round = 0; round < 3 && stalled < L1_STALL_ROUNDS; round += 1) {
    const before = best.objective;
    for (let ring = 0; ring < parameters.profile.length; ring += 1) {
      for (const delta of [-ringStep, ringStep]) {
        if (iterations >= L1_ITERATION_CAP) break;
        iterations += 1;
        const candidate = { ...parameters, profile: adjustRing(parameters.profile, ring, delta) };
        const scored = scoreAt(candidate, COARSE_STAGE);
        if (scored.objective < best.objective - L1_EPSILON) {
          best = scored;
          parameters = candidate;
        }
      }
    }
    trace.push({ stage: "l1-ring-pass", round, objective: best.objective, iterations });
    if (before - best.objective < L1_EPSILON) stalled += 1;
    else stalled = 0;
  }

  // Confirm at the refinement stage, then score under the complete protocol.
  const refined = scoreAt(parameters, REFINE_STAGE);
  trace.push({ stage: "l1-refine", objective: refined.objective });
  const final = scoreAt(parameters, FINAL_STAGE);
  trace.push({ stage: "final", objective: final.objective });

  return {
    fitted: true,
    operatorId: operator.operatorId,
    operatorVersion: operator.version,
    parameters,
    resolution: resolution.chosen,
    l0: {
      ringCount: l0.ringCount,
      populatedBins: l0.populatedBins,
      definition: l0.definition,
    },
    iterations,
    iterationCap: L1_ITERATION_CAP,
    epsilon: L1_EPSILON,
    earlyStopped: stalled >= L1_STALL_ROUNDS,
    trace,
    triangleCount: final.built.indices.length / 3,
    finalAggregate: final.scored.aggregate,
    finalViews: final.scored.views,
    framing,
  };
}
