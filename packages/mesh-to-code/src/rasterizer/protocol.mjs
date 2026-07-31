import {
  CAMERA_FOV_DEGREES,
  CANONICAL_MAX_DIMENSION,
  CAPTURE_SIZE,
  cameraPose,
  createEvaluationManifest,
  deriveReferenceFraming,
  EVALUATION_PROTOCOL_VERSION,
  EVALUATION_VIEWS,
  FRAMING_MARGIN,
} from "../measurement/vendor/gt_designer/single-mesh-evaluation/evaluation-protocol.js";

export {
  CAMERA_FOV_DEGREES,
  CANONICAL_MAX_DIMENSION,
  CAPTURE_SIZE,
  cameraPose,
  createEvaluationManifest,
  deriveReferenceFraming,
  EVALUATION_PROTOCOL_VERSION,
  EVALUATION_VIEWS,
  FRAMING_MARGIN,
};

/**
 * Progressive resolution for the fitting loop.
 *
 * A CPU rasterizer is affordable here only because the inner loop does not pay
 * the full protocol on every iteration: coarse search takes four views at an
 * eighth of the linear resolution, fine search takes the eight low-elevation
 * views at half, and only final scoring pays the complete twelve-view
 * `CAPTURE_SIZE` protocol. The final stage is not a sample of the protocol — it
 * is the protocol, which is what makes a final score comparable to a browser
 * capture at all.
 */
export const RESOLUTION_STAGES = Object.freeze([
  Object.freeze({
    id: "coarse",
    size: 128,
    viewIds: Object.freeze(["low-000", "low-090", "low-180", "low-270"]),
    purpose: "coarse structure search",
  }),
  Object.freeze({
    id: "fine",
    size: 256,
    viewIds: Object.freeze([
      "low-000",
      "low-045",
      "low-090",
      "low-135",
      "low-180",
      "low-225",
      "low-270",
      "low-315",
    ]),
    purpose: "parameter refinement",
  }),
  Object.freeze({
    id: "final",
    size: CAPTURE_SIZE,
    viewIds: Object.freeze(EVALUATION_VIEWS.map((view) => view.id)),
    purpose: "final scoring under the complete twelve-view protocol",
  }),
]);

export function resolutionStage(id) {
  const stage = RESOLUTION_STAGES.find((candidate) => candidate.id === id);
  if (!stage) {
    throw new Error(
      `unknown resolution stage: ${id} (known: ${RESOLUTION_STAGES.map((entry) => entry.id).join(", ")})`,
    );
  }
  return stage;
}

/**
 * Camera poses for one stage, framed from the Authored Reference bounds alone.
 * The replacement is never allowed to reframe the camera.
 */
export function stagePoses({ referenceWorldBounds, stageId }) {
  const stage = resolutionStage(stageId);
  const framing = deriveReferenceFraming(referenceWorldBounds);
  const poses = stage.viewIds.map((viewId) => {
    const view = EVALUATION_VIEWS.find((candidate) => candidate.id === viewId);
    if (!view) throw new Error(`unknown evaluation view: ${viewId}`);
    return cameraPose(view, framing);
  });
  return { stage, framing, poses };
}
