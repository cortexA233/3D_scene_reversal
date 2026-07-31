import { meshBounds, meshSurfaceArea } from "../geometry/mesh.mjs";
import { weldedConnectedComponents } from "../kernel/decompose.mjs";
import { bakeToEvaluationSpace, computeVertexNormals } from "../rasterizer/frame.mjs";
import { rasterizeView, stagePoses } from "../rasterizer/index.mjs";

/**
 * Reference-side complexity measurements, the inputs to the Complexity Budget
 * Formula. Four features, all derived from the Authored Reference alone and all
 * resolution-independent as retained values:
 *
 *   connectedComponentCount     welded connected components
 *   symmetryReducedPartCount    distinct part shapes after grouping congruent components
 *   materialRoleCount           material roles the input declares
 *   contourCurvatureComplexity  mean silhouette isoperimetric ratio over the view set
 *
 * Each is passed through `log2(1 + x)` before entering the formula, except the
 * contour ratio which is already bounded and dimensionless. The transform is part
 * of the frozen formula, not a preprocessing convenience: component counts run
 * from 1 to 76 across the regression corpus, and an untransformed linear term
 * would let the single most-subdivided unit set every coefficient.
 */

/**
 * Group components by a placement-invariant shape descriptor so five copies of
 * one mushroom count as one independent part, not five. The descriptor uses the
 * triangle count and the sorted bounding-box extents and surface area, both
 * normalized by the component's own longest extent, so translation, and uniform
 * scale within the quantization step, do not separate congruent parts.
 */
export function symmetryReducedParts(components) {
  const descriptors = new Map();
  for (const component of components) {
    const bounds = component.bounds;
    const extents = [...bounds.size].sort((a, b) => b - a);
    const longest = extents[0];
    const shape =
      longest > 0
        ? extents.map((value) => Math.round((value / longest) * 32) / 32)
        : [0, 0, 0];
    const area = meshSurfaceArea(component.mesh);
    const normalizedArea =
      longest > 0 ? Math.round((area / (longest * longest)) * 16) / 16 : 0;
    const key = `${component.mesh.triangleCount}|${shape.join(",")}|${normalizedArea}`;
    const bucket = descriptors.get(key) ?? [];
    bucket.push(component.componentIndex);
    descriptors.set(key, bucket);
  }
  return [...descriptors.entries()]
    .map(([descriptor, members]) => ({ descriptor, members }))
    .sort((a, b) => a.descriptor.localeCompare(b.descriptor));
}

/**
 * The isoperimetric ratio of a silhouette: `perimeter / (2 * sqrt(pi * area))`.
 * One for a disc, larger for a convoluted outline. It is a ratio of two pixel
 * counts, so it is dimensionless and independent of the capture resolution it
 * was measured at, which is what makes it a legitimate retained measurement.
 */
export function silhouetteContourComplexity({ positions, normals, indices, pose, size }) {
  const buffers = rasterizeView({ positions, normals, indices, pose, width: size, height: size });
  const mask = new Uint8Array(size * size);
  let area = 0;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (buffers.silhouette[pixel * 4] > 127) {
      mask[pixel] = 1;
      area += 1;
    }
  }
  if (area === 0) return null;
  let perimeter = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      if (!mask[index]) continue;
      if (
        x === 0 ||
        y === 0 ||
        x === size - 1 ||
        y === size - 1 ||
        !mask[index - 1] ||
        !mask[index + 1] ||
        !mask[index - size] ||
        !mask[index + size]
      ) {
        perimeter += 1;
      }
    }
  }
  return perimeter / (2 * Math.sqrt(Math.PI * area));
}

export const COMPLEXITY_MEASUREMENT_STAGE = "fine";

/**
 * @param {object} input
 * @param {object} input.mesh the Authored Reference in source-world coordinates
 * @param {number} input.materialRoleCount roles the input declares; 1 when it declares none
 */
export function measureReferenceComplexity({ mesh, materialRoleCount = 1 }) {
  const worldBounds = meshBounds(mesh);
  const { components, weldedVertexCount, weldTolerance } = weldedConnectedComponents(mesh);
  const parts = symmetryReducedParts(components);

  const { framing, poses, stage } = stagePoses({
    referenceWorldBounds: worldBounds,
    stageId: COMPLEXITY_MEASUREMENT_STAGE,
  });
  const baked = bakeToEvaluationSpace({
    positions: mesh.positions,
    indices: mesh.indices,
    transform: framing.referenceTransform,
  });
  baked.normals = computeVertexNormals(baked);

  const ratios = [];
  for (const pose of poses) {
    const ratio = silhouetteContourComplexity({
      positions: baked.positions,
      normals: baked.normals,
      indices: baked.indices,
      pose,
      size: stage.size,
    });
    if (ratio !== null) ratios.push(ratio);
  }
  if (ratios.length === 0) {
    throw new Error("the reference produced no silhouette in any view");
  }

  return {
    triangleCount: mesh.triangleCount,
    weldedVertexCount,
    weldTolerance,
    connectedComponentCount: components.length,
    symmetryReducedPartCount: parts.length,
    symmetryReducedPartDescriptors: parts.map((part) => ({
      descriptor: part.descriptor,
      memberCount: part.members.length,
    })),
    materialRoleCount,
    contourCurvatureComplexity:
      ratios.reduce((sum, value) => sum + value, 0) / ratios.length,
    contourCurvatureComplexityWorstView: Math.max(...ratios),
    contourMeasurement: {
      stage: stage.id,
      size: stage.size,
      viewCount: ratios.length,
      definition: "perimeter / (2 * sqrt(pi * area)), a dimensionless ratio",
    },
    worldBounds,
  };
}

/** The feature vector the formula consumes, in a fixed declared order. */
export const FEATURE_NAMES = Object.freeze([
  "intercept",
  "log2ConnectedComponents",
  "log2SymmetryReducedParts",
  "log2MaterialRoles",
  "contourCurvatureComplexity",
]);

export function featureVector(complexity) {
  return [
    1,
    Math.log2(1 + complexity.connectedComponentCount),
    Math.log2(1 + complexity.symmetryReducedPartCount),
    Math.log2(1 + complexity.materialRoleCount),
    complexity.contourCurvatureComplexity,
  ];
}
