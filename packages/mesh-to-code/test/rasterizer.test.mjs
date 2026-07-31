import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";

import { evaluateGeometryView } from "../src/measurement/index.mjs";
import {
  bakeToEvaluationSpace,
  bufferChecksum,
  CANONICAL_MAX_DIMENSION,
  CAPTURE_SIZE,
  computeVertexNormals,
  createReferenceBufferCache,
  EVALUATION_VIEWS,
  rasterizeCandidatesInParallel,
  rasterizeView,
  RESOLUTION_STAGES,
  scoreCandidateGeometry,
  stagePoses,
} from "../src/rasterizer/index.mjs";
import { generateFixtureObj } from "../src/fixtures/generate.mjs";
import { parseObj } from "../src/ingest/obj.mjs";
import { meshBounds } from "../src/geometry/mesh.mjs";

function fixtureGeometry(kind = "lathe-profile") {
  const mesh = parseObj(generateFixtureObj(kind)).selectors[0].mesh;
  const worldBounds = meshBounds(mesh);
  const { framing } = stagePoses({ referenceWorldBounds: worldBounds, stageId: "final" });
  const baked = bakeToEvaluationSpace({
    positions: mesh.positions,
    indices: mesh.indices,
    transform: framing.referenceTransform,
  });
  baked.normals = computeVertexNormals(baked);
  return { mesh, worldBounds, framing, geometry: baked, bounds: meshBounds(baked) };
}

function translate(geometry, offset) {
  const positions = Float64Array.from(geometry.positions);
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] += offset[0];
    positions[index + 1] += offset[1];
    positions[index + 2] += offset[2];
  }
  return { ...geometry, positions };
}

test("the rasterizer emits buffers the metric functions accept unchanged", () => {
  const { geometry, worldBounds, bounds } = fixtureGeometry();
  const { poses } = stagePoses({ referenceWorldBounds: worldBounds, stageId: "coarse" });
  const buffers = rasterizeView({
    positions: geometry.positions,
    normals: geometry.normals,
    indices: geometry.indices,
    pose: poses[0],
    width: 128,
    height: 128,
  });

  for (const key of ["silhouette", "depth", "worldNormal"]) {
    assert.ok(buffers[key] instanceof Uint8Array, `${key} must be a Uint8Array`);
    assert.equal(buffers[key].length, 128 * 128 * 4, `${key} must be width*height RGBA`);
  }

  // No metric is reimplemented: the buffers go straight into the copied function.
  const evidence = evaluateGeometryView({
    width: 128,
    height: 128,
    referenceSilhouette: buffers.silhouette,
    replacementSilhouette: buffers.silhouette,
    referenceDepth: buffers.depth,
    replacementDepth: buffers.depth,
    depthNear: poses[0].near,
    depthFar: poses[0].far,
    canonicalMaxDimension: CANONICAL_MAX_DIMENSION,
    referenceWorldNormal: buffers.worldNormal,
    replacementWorldNormal: buffers.worldNormal,
    referenceBounds: bounds,
    replacementBounds: bounds,
  });
  assert.equal(evidence.silhouette.iou, 1);
  assert.ok(evidence.silhouette.referenceForegroundPixels > 0, "something was drawn");
  assert.equal(evidence.depth.mae, 0);
});

test("silhouette is white on black and depth has a white background", () => {
  const { geometry, worldBounds } = fixtureGeometry();
  const { poses } = stagePoses({ referenceWorldBounds: worldBounds, stageId: "coarse" });
  const buffers = rasterizeView({
    positions: geometry.positions,
    normals: geometry.normals,
    indices: geometry.indices,
    pose: poses[0],
    width: 64,
    height: 64,
  });
  // Pixel 0 is a corner, which the framing margin keeps outside the silhouette.
  assert.deepEqual([...buffers.silhouette.slice(0, 4)], [0, 0, 0, 255]);
  assert.deepEqual([...buffers.depth.slice(0, 4)], [255, 255, 255, 255]);
  assert.deepEqual([...buffers.worldNormal.slice(0, 4)], [0, 0, 0, 255]);

  const centre = (32 * 64 + 32) * 4;
  assert.deepEqual([...buffers.silhouette.slice(centre, centre + 4)], [255, 255, 255, 255]);
  assert.ok(buffers.depth[centre] < 255, "the object is nearer than the background");
});

test("an identical candidate scores perfectly and a displaced one does not", () => {
  const { geometry, worldBounds, bounds } = fixtureGeometry();
  const cache = createReferenceBufferCache({ geometry, referenceWorldBounds: worldBounds });

  const identical = scoreCandidateGeometry({
    referenceCache: cache,
    referenceBounds: bounds,
    candidateGeometry: geometry,
    candidateBounds: bounds,
    stageId: "coarse",
    canonicalMaxDimension: CANONICAL_MAX_DIMENSION,
  });
  assert.equal(identical.aggregate.geometry.silhouette.meanIou, 1);
  assert.equal(identical.aggregate.geometry.silhouette.edgeDistanceP95Pixels, 0);
  assert.equal(identical.aggregate.geometry.depth.mae, 0);

  const displaced = translate(geometry, [0.35, 0, 0]);
  const displacedBounds = meshBounds(displaced);
  const worse = scoreCandidateGeometry({
    referenceCache: cache,
    referenceBounds: bounds,
    candidateGeometry: displaced,
    candidateBounds: displacedBounds,
    stageId: "coarse",
    canonicalMaxDimension: CANONICAL_MAX_DIMENSION,
  });
  assert.ok(
    worse.aggregate.geometry.silhouette.meanIou < identical.aggregate.geometry.silhouette.meanIou,
    "the ruler must discriminate a displaced candidate",
  );
  assert.ok(worse.aggregate.geometry.silhouette.edgeDistanceP95Pixels > 0);
});

test("reference-side buffers are computed once and reused across iterations", () => {
  const { geometry, worldBounds, bounds } = fixtureGeometry();
  const cache = createReferenceBufferCache({ geometry, referenceWorldBounds: worldBounds });
  const coarseViewCount = RESOLUTION_STAGES.find((stage) => stage.id === "coarse").viewIds
    .length;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    scoreCandidateGeometry({
      referenceCache: cache,
      referenceBounds: bounds,
      candidateGeometry: geometry,
      candidateBounds: bounds,
      stageId: "coarse",
      canonicalMaxDimension: CANONICAL_MAX_DIMENSION,
    });
  }
  assert.equal(
    cache.stats.rasterizations,
    coarseViewCount,
    "three iterations must not re-rasterize the reference",
  );
  assert.equal(cache.stats.cacheHits, 2);
});

test("progressive resolution goes from few small views to the full protocol", () => {
  const ids = RESOLUTION_STAGES.map((stage) => stage.id);
  assert.deepEqual(ids, ["coarse", "fine", "final"]);
  for (let index = 1; index < RESOLUTION_STAGES.length; index += 1) {
    assert.ok(
      RESOLUTION_STAGES[index].size > RESOLUTION_STAGES[index - 1].size,
      "each stage must raise the resolution",
    );
    assert.ok(
      RESOLUTION_STAGES[index].viewIds.length >= RESOLUTION_STAGES[index - 1].viewIds.length,
      "each stage must keep or widen the view set",
    );
  }
  const final = RESOLUTION_STAGES.at(-1);
  assert.equal(final.size, CAPTURE_SIZE);
  assert.deepEqual(
    [...final.viewIds],
    EVALUATION_VIEWS.map((view) => view.id),
    "final scoring is the complete twelve-view protocol, not a sample of it",
  );
});

test("output is byte-stable across two runs", () => {
  const { geometry, worldBounds } = fixtureGeometry();
  const { poses } = stagePoses({ referenceWorldBounds: worldBounds, stageId: "coarse" });
  const run = () =>
    poses.map((pose) =>
      bufferChecksum(
        rasterizeView({
          positions: geometry.positions,
          normals: geometry.normals,
          indices: geometry.indices,
          pose,
          width: 96,
          height: 96,
        }),
      ),
    );
  assert.deepEqual(run(), run());
});

test("the worker-thread path is byte-identical to the serial path", async () => {
  const first = fixtureGeometry("lathe-profile");
  const second = fixtureGeometry("repeated-group");
  const { poses } = stagePoses({
    referenceWorldBounds: first.worldBounds,
    stageId: "coarse",
  });

  const serial = [first, second].map((entry) =>
    poses.map((pose) =>
      bufferChecksum(
        rasterizeView({
          positions: entry.geometry.positions,
          normals: entry.geometry.normals,
          indices: entry.geometry.indices,
          pose,
          width: 96,
          height: 96,
        }),
      ),
    ),
  );

  const parallel = await rasterizeCandidatesInParallel({
    candidates: [
      { candidateId: "a", geometry: first.geometry },
      { candidateId: "b", geometry: second.geometry },
    ],
    poses,
    size: 96,
  });

  assert.deepEqual(
    parallel.map((candidate) => candidate.candidateId),
    ["a", "b"],
    "results are keyed by candidate, not by completion order",
  );
  assert.deepEqual(
    parallel.map((candidate) => candidate.views.map((view) => bufferChecksum(view.buffers))),
    serial,
  );
});

test("geometry entirely behind the camera produces an empty silhouette", () => {
  const { geometry, worldBounds } = fixtureGeometry();
  const { poses } = stagePoses({ referenceWorldBounds: worldBounds, stageId: "coarse" });
  const pose = poses[0];
  const pushedBehind = translate(geometry, [
    (pose.position[0] - pose.target[0]) * 4,
    (pose.position[1] - pose.target[1]) * 4,
    (pose.position[2] - pose.target[2]) * 4,
  ]);
  const buffers = rasterizeView({
    positions: pushedBehind.positions,
    normals: pushedBehind.normals,
    indices: pushedBehind.indices,
    pose,
    width: 64,
    height: 64,
  });
  const hash = createHash("sha256").update(buffers.silhouette).digest("hex");
  const empty = createHash("sha256")
    .update(
      (() => {
        const blank = new Uint8Array(64 * 64 * 4);
        for (let pixel = 0; pixel < 64 * 64; pixel += 1) blank[pixel * 4 + 3] = 255;
        return blank;
      })(),
    )
    .digest("hex");
  assert.equal(hash, empty, "nothing in front of the camera means nothing drawn");
});

test("malformed rasterizer input is refused rather than rendered", () => {
  const { geometry, worldBounds } = fixtureGeometry();
  const { poses } = stagePoses({ referenceWorldBounds: worldBounds, stageId: "coarse" });
  assert.throws(
    () =>
      rasterizeView({
        positions: geometry.positions,
        normals: geometry.normals,
        indices: geometry.indices,
        pose: poses[0],
        width: 0,
        height: 64,
      }),
    /positive integers/,
  );
  assert.throws(
    () =>
      rasterizeView({
        positions: geometry.positions,
        normals: new Float64Array(3),
        indices: geometry.indices,
        pose: poses[0],
        width: 64,
        height: 64,
      }),
    /must match the position count/,
  );
});
