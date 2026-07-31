import { createHash } from "node:crypto";

import { evaluateGeometryView, aggregateGeometryEvidence } from "../measurement/index.mjs";
import { rasterizeView, PASS_IDS } from "./rasterize.mjs";
import { resolutionStage, stagePoses } from "./protocol.mjs";

export { rasterizeView, PASS_IDS };
export * from "./protocol.mjs";
export { bakeToEvaluationSpace, computeVertexNormals, mergeParts } from "./frame.mjs";
export { rasterizeCandidatesInParallel, availableWorkerCount } from "./parallel.mjs";

export function bufferChecksum(buffers) {
  const hash = createHash("sha256");
  for (const passId of PASS_IDS) {
    const key = passId === "linear-depth" ? "depth" : passId === "world-normal" ? "worldNormal" : "silhouette";
    hash.update(buffers[key]);
  }
  return hash.digest("hex");
}

export function rasterizeStage({ geometry, referenceWorldBounds, stageId }) {
  const { stage, poses, framing } = stagePoses({ referenceWorldBounds, stageId });
  return {
    stage,
    framing,
    views: poses.map((pose) => ({
      viewId: pose.id,
      buffers: rasterizeView({
        positions: geometry.positions,
        normals: geometry.normals,
        indices: geometry.indices,
        pose,
        width: stage.size,
        height: stage.size,
      }),
    })),
  };
}

/**
 * Reference-side buffers are rasterized once and cached across fitting
 * iterations. The reference never changes during a run, so paying for it per
 * iteration would double the inner loop's cost for nothing.
 */
export function createReferenceBufferCache({ geometry, referenceWorldBounds }) {
  const cache = new Map();
  let rasterizations = 0;
  let cacheHits = 0;

  return {
    get stats() {
      return { rasterizations, cacheHits, cachedEntries: cache.size };
    },
    framing: stagePoses({ referenceWorldBounds, stageId: "final" }).framing,
    buffersFor(stageId) {
      if (cache.has(stageId)) {
        cacheHits += 1;
        return cache.get(stageId);
      }
      const stage = resolutionStage(stageId);
      const { poses } = stagePoses({ referenceWorldBounds, stageId });
      const entry = {
        stage,
        views: poses.map((pose) => {
          rasterizations += 1;
          return {
            viewId: pose.id,
            pose,
            buffers: rasterizeView({
              positions: geometry.positions,
              normals: geometry.normals,
              indices: geometry.indices,
              pose,
              width: stage.size,
              height: stage.size,
            }),
          };
        }),
      };
      cache.set(stageId, entry);
      return entry;
    },
  };
}

/**
 * Score one candidate against a cached reference through the copied metric
 * functions. No metric is reimplemented here: the buffers are handed to
 * `evaluateGeometryView` in exactly the shape it already accepts, and the
 * per-view results are aggregated by `aggregateGeometryEvidence`.
 */
export function scoreCandidateGeometry({
  referenceCache,
  referenceBounds,
  candidateGeometry,
  candidateBounds,
  stageId,
  canonicalMaxDimension,
}) {
  const reference = referenceCache.buffersFor(stageId);
  const views = reference.views.map(({ viewId, pose, buffers: referenceBuffers }) => {
    const candidateBuffers = rasterizeView({
      positions: candidateGeometry.positions,
      normals: candidateGeometry.normals,
      indices: candidateGeometry.indices,
      pose,
      width: reference.stage.size,
      height: reference.stage.size,
    });
    return {
      viewId,
      geometry: evaluateGeometryView({
        width: reference.stage.size,
        height: reference.stage.size,
        referenceSilhouette: referenceBuffers.silhouette,
        replacementSilhouette: candidateBuffers.silhouette,
        referenceDepth: referenceBuffers.depth,
        replacementDepth: candidateBuffers.depth,
        depthNear: pose.near,
        depthFar: pose.far,
        canonicalMaxDimension,
        referenceWorldNormal: referenceBuffers.worldNormal,
        replacementWorldNormal: candidateBuffers.worldNormal,
        referenceBounds,
        replacementBounds: candidateBounds,
      }),
    };
  });
  return { stageId, views, aggregate: aggregateGeometryEvidence(views) };
}
