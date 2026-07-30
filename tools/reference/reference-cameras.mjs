import { deepFreeze } from "./reference-value.mjs";

function vectorSubtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(value) {
  const length = Math.hypot(...value);
  if (length === 0) throw new RangeError("camera direction must be non-zero");
  return value.map((component) => component / length);
}

function round(value) {
  const result = Number(value.toFixed(9));
  return Object.is(result, -0) ? 0 : result;
}

function viewMatrix(position, target, up) {
  const z = normalize(vectorSubtract(position, target));
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return [
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    -dot(x, position),
    -dot(y, position),
    -dot(z, position),
    1,
  ].map(round);
}

function projectionMatrix(verticalFovDegrees, aspect, near, far) {
  const f = 1 / Math.tan((verticalFovDegrees * Math.PI) / 360);
  return [
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) / (near - far),
    -1,
    0,
    0,
    (2 * far * near) / (near - far),
    0,
  ].map(round);
}

function makeCamera({
  position,
  target,
  up = [0, 1, 0],
  verticalFovDegrees,
  aspect,
  near,
  far,
}) {
  const roundedPosition = position.map(round);
  const roundedTarget = target.map(round);
  return {
    position: roundedPosition,
    target: roundedTarget,
    up,
    verticalFovDegrees,
    aspect: round(aspect),
    near,
    far,
    viewMatrix: viewMatrix(roundedPosition, roundedTarget, up),
    projectionMatrix: projectionMatrix(verticalFovDegrees, aspect, near, far),
  };
}

function validateBounds(bounds, what) {
  if (
    !bounds ||
    ![bounds.min, bounds.max].every(
      (point) =>
        Array.isArray(point) &&
        point.length === 3 &&
        point.every(Number.isFinite),
    ) ||
    bounds.min.some((value, index) => value > bounds.max[index])
  ) {
    throw new TypeError(`${what} must contain finite ordered min/max points`);
  }
}

/**
 * The auxiliary cameras frame the island, not everything the authored scene
 * contains.
 *
 * Framing the full authored extent puts the camera outside the reference's own
 * atmosphere. The 16 distant horizon ridges reach past 1800 units while the
 * island reaches 280, so they alone decide the standoff, and a standoff that
 * clears them exceeds the fog's far plane. The result is a camera that records
 * fog rather than geometry. `framingSubject` is therefore the island volume,
 * measured from reference evidence with the backdrop excluded, while
 * `authoredBounds` stays in the output as provenance for what was set aside.
 *
 * See ADR-0049. The margin constants below are unchanged from v1: only the
 * volume they are applied to has changed.
 */
export function deriveReferenceCameraSet({
  authoredBounds,
  framingSubject,
  sceneAnchor,
  aspect,
  verticalFovDegrees,
  near,
  far,
}) {
  validateBounds(authoredBounds, "authoredBounds");
  validateBounds(framingSubject, "framingSubject");
  if (!Array.isArray(sceneAnchor) || sceneAnchor.length !== 3) {
    throw new TypeError("sceneAnchor must be a 3D point");
  }

  const center = framingSubject.min.map(
    (value, index) => (value + framingSubject.max[index]) / 2,
  );
  const halfExtent = framingSubject.min.map(
    (value, index) => (framingSubject.max[index] - value) / 2,
  );
  const tangent = Math.tan((verticalFovDegrees * Math.PI) / 360);
  const anchorExtentX = Math.max(
    Math.abs(framingSubject.min[0] - sceneAnchor[0]),
    Math.abs(framingSubject.max[0] - sceneAnchor[0]),
  );
  const anchorExtentZ = Math.max(
    Math.abs(framingSubject.min[2] - sceneAnchor[2]),
    Math.abs(framingSubject.max[2] - sceneAnchor[2]),
  );
  const topDownHeight =
    Math.max(anchorExtentZ / tangent, anchorExtentX / (tangent * aspect)) * 1.15 +
    Math.max(0, framingSubject.max[1] - sceneAnchor[1]);
  const horizontalDistance =
    (Math.hypot(halfExtent[0], halfExtent[2]) / tangent) * 1.2;
  const obliqueHeight = Math.max(halfExtent[1] * 1.5, horizontalDistance * 0.62);
  const common = { verticalFovDegrees, aspect, near, far };
  const target = center.map(round);

  return deepFreeze({
    schemaVersion: "reference-camera-set-v2",
    framingBasis: "reference-island-subject",
    authoredBounds: {
      min: authoredBounds.min.map(round),
      max: authoredBounds.max.map(round),
    },
    framingSubject: {
      min: framingSubject.min.map(round),
      max: framingSubject.max.map(round),
    },
    topDown: makeCamera({
      ...common,
      position: [sceneAnchor[0], sceneAnchor[1] + topDownHeight, sceneAnchor[2]],
      target: sceneAnchor,
      up: [0, 0, -1],
    }),
    obliques: {
      north: makeCamera({
        ...common,
        position: [target[0], target[1] + obliqueHeight, target[2] - horizontalDistance],
        target,
      }),
      east: makeCamera({
        ...common,
        position: [target[0] + horizontalDistance, target[1] + obliqueHeight, target[2]],
        target,
      }),
      south: makeCamera({
        ...common,
        position: [target[0], target[1] + obliqueHeight, target[2] + horizontalDistance],
        target,
      }),
      west: makeCamera({
        ...common,
        position: [target[0] - horizontalDistance, target[1] + obliqueHeight, target[2]],
        target,
      }),
    },
  });
}
