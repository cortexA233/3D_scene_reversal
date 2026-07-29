import assert from "node:assert/strict";
import test from "node:test";

import {
  CAMERA_FOV_DEGREES,
  CANONICAL_MAX_DIMENSION,
  CAPTURE_SIZE,
  cameraDirection,
  createEvaluationManifest,
  deriveReferenceFraming,
  EVALUATION_PASSES,
  EVALUATION_VIEWS,
  FRAMING_MARGIN,
} from "../gt_designer/single-mesh-evaluation/evaluation-protocol.js";

const REFERENCE_BOUNDS = {
  min: [10, 2, -4],
  max: [20, 7, 2],
};

function closeTo(actual, expected, epsilon = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${actual} is not within ${epsilon} of ${expected}`,
  );
}

test("evaluation protocol freezes the declared twelve-view set", () => {
  assert.equal(EVALUATION_VIEWS.length, 12);
  assert.deepEqual(
    EVALUATION_VIEWS.map((view) => [
      view.elevationDegrees,
      view.azimuthDegrees,
    ]),
    [
      [20, 0],
      [20, 45],
      [20, 90],
      [20, 135],
      [20, 180],
      [20, 225],
      [20, 270],
      [20, 315],
      [60, 45],
      [60, 135],
      [60, 225],
      [60, 315],
    ],
  );
  assert.deepEqual(
    EVALUATION_VIEWS.map((view) => view.id),
    [
      "low-000",
      "low-045",
      "low-090",
      "low-135",
      "low-180",
      "low-225",
      "low-270",
      "low-315",
      "high-045",
      "high-135",
      "high-225",
      "high-315",
    ],
  );
});

test("evaluation protocol freezes capture and pass definitions", () => {
  assert.equal(CAPTURE_SIZE, 512);
  assert.equal(CAMERA_FOV_DEGREES, 38);
  assert.equal(CANONICAL_MAX_DIMENSION, 7);
  assert.equal(FRAMING_MARGIN, 1.1);
  assert.deepEqual(
    EVALUATION_PASSES.map((pass) => pass.id),
    [
      "neutral-rgb",
      "silhouette",
      "linear-depth",
      "world-normal",
      "semantic-id",
      "albedo",
      "lit-rgb",
    ],
  );
});

test("framing is derived only from reference bounds", () => {
  const framing = deriveReferenceFraming(REFERENCE_BOUNDS);
  assert.deepEqual(framing.sourceWorldBounds.size, [10, 5, 6]);
  assert.deepEqual(
    framing.reconstructionFrame.sourceWorldBottomCenter,
    [15, 2, -1],
  );
  assert.deepEqual(
    framing.referenceTransform.translationBeforeScale,
    [-15, -2, 1],
  );
  closeTo(framing.referenceTransform.uniformScale, 0.7);
  assert.deepEqual(framing.replacementTransform.translationBeforeScale, [0, 0, 0]);
  closeTo(framing.replacementTransform.uniformScale, 0.7);
  assert.equal(framing.replacementTransform.independentlyFramed, false);
  framing.canonicalBounds.min.forEach((value, axis) =>
    closeTo(value, [-3.5, 0, -2.1][axis]),
  );
  framing.canonicalBounds.max.forEach((value, axis) =>
    closeTo(value, [3.5, 3.5, 2.1][axis]),
  );
  assert.deepEqual(framing.camera.target, [0, 1.75, 0]);
  assert.ok(framing.camera.near > 0);
  assert.ok(framing.camera.far > framing.camera.distance);
});

test("camera directions use documented source-world axes", () => {
  const forward = cameraDirection(EVALUATION_VIEWS[0]);
  closeTo(forward[0], 0);
  closeTo(forward[1], Math.sin((20 * Math.PI) / 180));
  closeTo(forward[2], Math.cos((20 * Math.PI) / 180));
  const right = cameraDirection(EVALUATION_VIEWS[2]);
  closeTo(right[0], Math.cos((20 * Math.PI) / 180));
  closeTo(right[2], 0);
});

test("manifest contains only reference-derived framing and complete poses", () => {
  const manifest = createEvaluationManifest("stone-path", REFERENCE_BOUNDS);
  assert.equal(manifest.unitId, "stone-path");
  assert.equal(manifest.capture.width, 512);
  assert.equal(manifest.views.length, 12);
  assert.equal(manifest.passes.length, 7);
  assert.deepEqual(manifest.captures, []);
  for (const view of manifest.views) {
    closeTo(
      Math.hypot(
        view.position[0] - view.target[0],
        view.position[1] - view.target[1],
        view.position[2] - view.target[2],
      ),
      manifest.framing.camera.distance,
    );
    assert.equal(view.near, manifest.framing.camera.near);
    assert.equal(view.far, manifest.framing.camera.far);
  }
});

test("invalid or degenerate reference bounds fail before capture", () => {
  assert.throws(
    () => deriveReferenceFraming({ min: [0, 0], max: [1, 1, 1] }),
    /three-number/,
  );
  assert.throws(
    () => deriveReferenceFraming({ min: [0, 0, 0], max: [1, 0, 1] }),
    /positive dimensions/,
  );
  assert.throws(
    () => createEvaluationManifest("", REFERENCE_BOUNDS),
    /unitId/,
  );
});
