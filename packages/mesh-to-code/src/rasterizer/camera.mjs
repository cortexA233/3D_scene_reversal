/**
 * View and projection matrices that reproduce the browser evaluation harness.
 *
 * The harness uses a `THREE.PerspectiveCamera` with `camera.lookAt(target)` and
 * aspect 1, so the matrices here follow `Matrix4.lookAt` and
 * `Matrix4.makePerspective` exactly rather than a textbook equivalent. Matching
 * the convention matters more than elegance: a different handedness or a
 * different frustum centring would show up as rasterizer-versus-browser
 * divergence that is really a camera bug.
 */

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Explicit sqrt rather than Math.hypot: only IEEE-754-exact operations. */
function normalize(v) {
  const lengthSquared = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  if (lengthSquared === 0) return [0, 0, 0];
  const inverse = 1 / Math.sqrt(lengthSquared);
  return [v[0] * inverse, v[1] * inverse, v[2] * inverse];
}

/**
 * The camera basis `Matrix4.lookAt` produces: z from target to eye, x from
 * up × z, y from z × x.
 */
export function cameraBasis({ position, target, up }) {
  let z = subtract(position, target);
  if (z[0] === 0 && z[1] === 0 && z[2] === 0) z = [0, 0, 1];
  z = normalize(z);
  let x = cross(up, z);
  if (x[0] === 0 && x[1] === 0 && x[2] === 0) {
    // Three.js nudges the up vector when it is parallel to z.
    const nudged = Math.abs(up[2]) === 1 ? [up[0] + 0.0001, up[1], up[2]] : [up[0], up[1], up[2] + 0.0001];
    x = cross(nudged, z);
  }
  x = normalize(x);
  const y = cross(z, x);
  return { x, y, z };
}

/**
 * The view transform as three basis rows plus the translation, which is all the
 * rasterizer needs: `view(p) = [x·(p−eye), y·(p−eye), z·(p−eye)]`. The camera
 * looks down −z, so a visible point has a negative third component and
 * `viewDistance = −z·(p−eye)`, exactly the `-viewPosition.z` the harness's depth
 * shader writes.
 */
export function createViewTransform(pose) {
  const { x, y, z } = cameraBasis(pose);
  const eye = pose.position;
  return {
    basis: { x, y, z },
    eye: [...eye],
    apply(px, py, pz) {
      const dx = px - eye[0];
      const dy = py - eye[1];
      const dz = pz - eye[2];
      return [
        x[0] * dx + x[1] * dy + x[2] * dz,
        y[0] * dx + y[1] * dy + y[2] * dz,
        z[0] * dx + z[1] * dy + z[2] * dz,
      ];
    },
    /** `mat3(modelMatrix) * normal` is applied by the caller; only rotation is needed here. */
    applyDirection(nx, ny, nz) {
      return [
        x[0] * nx + x[1] * ny + x[2] * nz,
        y[0] * nx + y[1] * ny + y[2] * nz,
        z[0] * nx + z[1] * ny + z[2] * nz,
      ];
    },
  };
}

/**
 * `Matrix4.makePerspective` for a symmetric frustum with aspect 1, reduced to
 * the four scalars a rasterizer uses.
 */
export function createProjection({ fovDegrees, near, far, aspect = 1 }) {
  if (!(near > 0) || !(far > near)) {
    throw new RangeError("projection requires 0 < near < far");
  }
  const top = near * Math.tan(((Math.PI / 180) * 0.5 * fovDegrees));
  const height = 2 * top;
  const width = aspect * height;
  const left = -0.5 * width;
  const right = left + width;
  const bottom = top - height;
  return {
    xScale: (2 * near) / (right - left),
    yScale: (2 * near) / (top - bottom),
    xOffset: (right + left) / (right - left),
    yOffset: (top + bottom) / (top - bottom),
    zScale: -(far + near) / (far - near),
    zOffset: (-2 * far * near) / (far - near),
    near,
    far,
  };
}

export { dot, cross, normalize, subtract };
