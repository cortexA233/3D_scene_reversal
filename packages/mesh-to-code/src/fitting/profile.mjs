import { meshBounds } from "../geometry/mesh.mjs";

/**
 * L0: analytic measurements, no rendering.
 *
 * Extract an axial `[radius, height]` profile from a mesh by binning vertices by
 * height and taking the outer radius per bin. The outer radius rather than the mean
 * because the silhouette is what the geometry metrics measure, and the silhouette
 * follows the outer extent.
 *
 * Pure and deterministic: the same mesh and ring count always give the same profile,
 * with no iteration over a hash-ordered collection and no ambient state.
 */
export function extractAxialProfile({ mesh, ringCount }) {
  if (!Number.isInteger(ringCount) || ringCount < 2) {
    throw new RangeError("ringCount must be an integer of at least two");
  }
  const bounds = meshBounds(mesh);
  const height = bounds.size[1];
  if (!(height > 0)) {
    throw new RangeError("a lathe profile needs a positive height extent");
  }
  const axisX = (bounds.min[0] + bounds.max[0]) * 0.5;
  const axisZ = (bounds.min[2] + bounds.max[2]) * 0.5;

  const binOuterRadius = new Float64Array(ringCount).fill(0);
  const binCount = new Uint32Array(ringCount);
  const lastBin = ringCount - 1;

  for (let offset = 0; offset < mesh.positions.length; offset += 3) {
    const dx = mesh.positions[offset] - axisX;
    const dz = mesh.positions[offset + 2] - axisZ;
    const radius = Math.sqrt(dx * dx + dz * dz);
    const normalized = (mesh.positions[offset + 1] - bounds.min[1]) / height;
    let bin = Math.floor(normalized * ringCount);
    if (bin < 0) bin = 0;
    if (bin > lastBin) bin = lastBin;
    binCount[bin] += 1;
    if (radius > binOuterRadius[bin]) binOuterRadius[bin] = radius;
  }

  // An empty bin inherits from its nearest populated neighbours, so a profile is
  // continuous even where a reference has a gap along the axis.
  for (let bin = 0; bin <= lastBin; bin += 1) {
    if (binCount[bin] > 0) continue;
    let below = bin - 1;
    while (below >= 0 && binCount[below] === 0) below -= 1;
    let above = bin + 1;
    while (above <= lastBin && binCount[above] === 0) above += 1;
    const belowRadius = below >= 0 ? binOuterRadius[below] : null;
    const aboveRadius = above <= lastBin ? binOuterRadius[above] : null;
    binOuterRadius[bin] =
      belowRadius === null
        ? (aboveRadius ?? 0)
        : aboveRadius === null
          ? belowRadius
          : (belowRadius + aboveRadius) * 0.5;
  }

  const profile = [];
  for (let bin = 0; bin <= lastBin; bin += 1) {
    const centre = (bin + 0.5) / ringCount;
    profile.push([binOuterRadius[bin], centre * height]);
  }
  // Anchor the ends on the measured extents so the replacement's height matches.
  profile[0] = [binOuterRadius[0], 0];
  profile[lastBin] = [binOuterRadius[lastBin], height];

  return {
    profile,
    height,
    axis: [axisX, axisZ],
    ringCount,
    populatedBins: [...binCount].filter((count) => count > 0).length,
    definition:
      "outer radius per height bin about the bounds-centre vertical axis, with empty bins interpolated and the end rings anchored on the measured extents",
  };
}

/**
 * Triangles a lathe of this shape produces, so the search can respect a triangle
 * budget without building the geometry first.
 */
export function latheTriangleCount({ profile, radialSegments }) {
  let triangles = 0;
  for (let ring = 0; ring + 1 < profile.length; ring += 1) {
    const lowerDegenerate = profile[ring][0] <= 0;
    const upperDegenerate = profile[ring + 1][0] <= 0;
    if (lowerDegenerate && upperDegenerate) continue;
    triangles += lowerDegenerate || upperDegenerate ? radialSegments : radialSegments * 2;
  }
  for (const ring of [0, profile.length - 1]) {
    if (profile[ring][0] > 0) triangles += radialSegments;
  }
  return triangles;
}

/**
 * The largest (ringCount, radialSegments) pair from the declared ladders whose
 * lathe fits the triangle budget. Chosen analytically, before any rasterization.
 */
export const RING_LADDER = Object.freeze([6, 8, 12, 16, 20, 24, 32]);
export const SEGMENT_LADDER = Object.freeze([8, 12, 16, 24, 32]);

export function chooseLatheResolution({ mesh, triangleBudget }) {
  let best = null;
  for (const ringCount of RING_LADDER) {
    const { profile } = extractAxialProfile({ mesh, ringCount });
    for (const radialSegments of SEGMENT_LADDER) {
      const triangles = latheTriangleCount({ profile, radialSegments });
      if (triangles > triangleBudget) continue;
      if (best === null || triangles > best.triangles) {
        best = { ringCount, radialSegments, triangles };
      }
    }
  }
  if (best === null) {
    return {
      chosen: null,
      reason: `no ladder rung fits a triangle budget of ${triangleBudget}`,
    };
  }
  return { chosen: best, reason: null };
}
