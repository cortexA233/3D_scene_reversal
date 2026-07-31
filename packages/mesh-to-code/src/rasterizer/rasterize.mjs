import { createProjection, createViewTransform } from "./camera.mjs";

/**
 * A pure-JavaScript triangle rasterizer that emits the three geometry buffers
 * the copied metric functions already accept, in the encodings the browser
 * evaluation harness writes:
 *
 *   silhouette   white foreground on a black background
 *   linear-depth RGB = clamp((viewDistance − near) / (far − near), 0, 1), white background
 *   world-normal RGB = normalize(worldNormal) * 0.5 + 0.5, black background,
 *                with the normal flipped on back faces
 *
 * Matched harness behaviour that changes the result:
 *
 *   · every pass material is `THREE.DoubleSide`, so nothing is culled and back
 *     faces flip their normal exactly as `if (!gl_FrontFacing)` does;
 *   · captures read from a `WebGLRenderTarget` with no `samples` option, so they
 *     are not multisampled — a hard-edged pixel-centre rule is the right model,
 *     not coverage blending;
 *   · depth carries `-viewPosition.z`, the view-space distance, not the
 *     euclidean distance to the eye;
 *   · `readRenderTargetPixels` reads bottom-to-top, so row 0 is the bottom row.
 *
 * Byte stability: every operation in the inner loop is IEEE-754 exact —
 * add, subtract, multiply, divide, `Math.sqrt`, `Math.floor`, `Math.min`,
 * `Math.max`, `Math.round`, and comparisons. No `Math.hypot`, no trigonometry,
 * no iteration over a hash-ordered collection. Identical inputs therefore
 * produce identical bytes on any platform running the same arithmetic.
 */

export const PASS_IDS = Object.freeze(["silhouette", "linear-depth", "world-normal"]);

function encodeByte(value) {
  const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
  return Math.round(clamped * 255);
}

/**
 * @param {object} input
 * @param {Float64Array} input.positions world-space xyz triples
 * @param {Float64Array} input.normals world-space xyz triples, need not be unit length
 * @param {Uint32Array} input.indices triangle indices
 * @param {object} input.pose position, target, up, fovDegrees, near, far
 * @param {number} input.width
 * @param {number} input.height
 */
export function rasterizeView({ positions, normals, indices, pose, width, height }) {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError("width and height must be positive integers");
  }
  if (positions.length % 3 !== 0 || indices.length % 3 !== 0) {
    throw new RangeError("positions and indices must be multiples of three");
  }
  if (normals && normals.length !== positions.length) {
    throw new RangeError("normals must match the position count");
  }

  const view = createViewTransform(pose);
  const projection = createProjection({
    fovDegrees: pose.fovDegrees,
    near: pose.near,
    far: pose.far,
  });
  const { near, far } = projection;
  const depthRange = far - near;

  const pixelCount = width * height;
  const silhouette = new Uint8Array(pixelCount * 4);
  const depth = new Uint8Array(pixelCount * 4);
  const worldNormal = new Uint8Array(pixelCount * 4);
  const zBuffer = new Float64Array(pixelCount).fill(Infinity);

  // Backgrounds: silhouette and world-normal are black, linear-depth is white.
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    silhouette[offset + 3] = 255;
    worldNormal[offset + 3] = 255;
    depth[offset] = 255;
    depth[offset + 1] = 255;
    depth[offset + 2] = 255;
    depth[offset + 3] = 255;
  }

  const vertexCount = positions.length / 3;
  const screenX = new Float64Array(vertexCount);
  const screenY = new Float64Array(vertexCount);
  const ndcZ = new Float64Array(vertexCount);
  const inverseDistance = new Float64Array(vertexCount);
  // World normals are carried through unchanged: the harness's world-normal pass
  // encodes `normalize(mat3(modelMatrix) * normal)`, which is a world-space
  // direction, not a view-space one.
  const normalX = new Float64Array(vertexCount);
  const normalY = new Float64Array(vertexCount);
  const normalZ = new Float64Array(vertexCount);
  const behind = new Uint8Array(vertexCount);

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const [vx, vy, vz] = view.apply(
      positions[offset],
      positions[offset + 1],
      positions[offset + 2],
    );
    const distance = -vz;
    if (!(distance > 0)) {
      behind[vertex] = 1;
      continue;
    }
    const clipX = projection.xScale * vx + projection.xOffset * vz;
    const clipY = projection.yScale * vy + projection.yOffset * vz;
    const clipZ = projection.zScale * vz + projection.zOffset;
    const inverseW = 1 / distance;
    screenX[vertex] = (clipX * inverseW * 0.5 + 0.5) * width;
    screenY[vertex] = (clipY * inverseW * 0.5 + 0.5) * height;
    ndcZ[vertex] = clipZ * inverseW;
    inverseDistance[vertex] = inverseW;
    if (normals) {
      normalX[vertex] = normals[offset];
      normalY[vertex] = normals[offset + 1];
      normalZ[vertex] = normals[offset + 2];
    }
  }

  for (let face = 0; face < indices.length; face += 3) {
    const a = indices[face];
    const b = indices[face + 1];
    const c = indices[face + 2];
    if (behind[a] || behind[b] || behind[c]) continue;

    const ax = screenX[a];
    const ay = screenY[a];
    const bx = screenX[b];
    const by = screenY[b];
    const cx = screenX[c];
    const cy = screenY[c];

    // Signed area in window coordinates with y up. GL's default front face is
    // counter-clockwise, so a positive area is front-facing.
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (area === 0) continue;
    const frontFacing = area > 0;
    const inverseArea = 1 / area;

    let minX = Math.floor(Math.min(ax, bx, cx) - 0.5);
    let maxX = Math.floor(Math.max(ax, bx, cx) + 0.5);
    let minY = Math.floor(Math.min(ay, by, cy) - 0.5);
    let maxY = Math.floor(Math.max(ay, by, cy) + 0.5);
    if (minX < 0) minX = 0;
    if (minY < 0) minY = 0;
    if (maxX > width - 1) maxX = width - 1;
    if (maxY > height - 1) maxY = height - 1;
    if (minX > maxX || minY > maxY) continue;

    const invDistanceA = inverseDistance[a];
    const invDistanceB = inverseDistance[b];
    const invDistanceC = inverseDistance[c];

    for (let pixelY = minY; pixelY <= maxY; pixelY += 1) {
      const sampleY = pixelY + 0.5;
      for (let pixelX = minX; pixelX <= maxX; pixelX += 1) {
        const sampleX = pixelX + 0.5;

        const weightA =
          ((bx - sampleX) * (cy - sampleY) - (by - sampleY) * (cx - sampleX)) *
          inverseArea;
        const weightB =
          ((cx - sampleX) * (ay - sampleY) - (cy - sampleY) * (ax - sampleX)) *
          inverseArea;
        const weightC = 1 - weightA - weightB;
        if (weightA < 0 || weightB < 0 || weightC < 0) continue;

        const pixel = pixelY * width + pixelX;
        const interpolatedNdcZ =
          weightA * ndcZ[a] + weightB * ndcZ[b] + weightC * ndcZ[c];
        if (!(interpolatedNdcZ < zBuffer[pixel])) continue;
        zBuffer[pixel] = interpolatedNdcZ;

        const inverseWSum =
          weightA * invDistanceA + weightB * invDistanceB + weightC * invDistanceC;
        const viewDistance = 1 / inverseWSum;

        const offset = pixel * 4;
        silhouette[offset] = 255;
        silhouette[offset + 1] = 255;
        silhouette[offset + 2] = 255;

        const encodedDepth = encodeByte((viewDistance - near) / depthRange);
        depth[offset] = encodedDepth;
        depth[offset + 1] = encodedDepth;
        depth[offset + 2] = encodedDepth;

        if (normals) {
          const perspectiveA = weightA * invDistanceA;
          const perspectiveB = weightB * invDistanceB;
          const perspectiveC = weightC * invDistanceC;
          let nx =
            (perspectiveA * normalX[a] +
              perspectiveB * normalX[b] +
              perspectiveC * normalX[c]) *
            viewDistance;
          let ny =
            (perspectiveA * normalY[a] +
              perspectiveB * normalY[b] +
              perspectiveC * normalY[c]) *
            viewDistance;
          let nz =
            (perspectiveA * normalZ[a] +
              perspectiveB * normalZ[b] +
              perspectiveC * normalZ[c]) *
            viewDistance;
          const lengthSquared = nx * nx + ny * ny + nz * nz;
          if (lengthSquared > 0) {
            const inverseLength = 1 / Math.sqrt(lengthSquared);
            nx *= inverseLength;
            ny *= inverseLength;
            nz *= inverseLength;
          }
          if (!frontFacing) {
            nx = -nx;
            ny = -ny;
            nz = -nz;
          }
          worldNormal[offset] = encodeByte(nx * 0.5 + 0.5);
          worldNormal[offset + 1] = encodeByte(ny * 0.5 + 0.5);
          worldNormal[offset + 2] = encodeByte(nz * 0.5 + 0.5);
        }
      }
    }
  }

  return { width, height, silhouette, depth, worldNormal };
}
