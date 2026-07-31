import { createContractOperator } from "./contract.mjs";

/**
 * Revolve one axial profile into a closed solid.
 *
 * Self-contained on purpose: this function's own `toString()` is what the emitted
 * generator carries, so it closes over nothing and calls nothing but `Math`. Its
 * numeric literals are algorithm constants — a full turn, a half step, a
 * degenerate-radius epsilon — not Object-specific Scalars.
 *
 * @param {{profile: Array<[number, number]>, radialSegments: number}} parameters
 */
function latheProfile(parameters) {
  const profile = parameters.profile;
  const segments = parameters.radialSegments;
  const positions = [];
  const indices = [];
  const ringStart = [];

  for (let ring = 0; ring < profile.length; ring += 1) {
    const radius = profile[ring][0];
    const height = profile[ring][1];
    ringStart.push(positions.length / 3);
    if (radius <= 0) {
      positions.push(0, height, 0);
      continue;
    }
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    }
  }

  for (let ring = 0; ring + 1 < profile.length; ring += 1) {
    const lowerDegenerate = profile[ring][0] <= 0;
    const upperDegenerate = profile[ring + 1][0] <= 0;
    const lower = ringStart[ring];
    const upper = ringStart[ring + 1];
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      if (lowerDegenerate && upperDegenerate) continue;
      if (lowerDegenerate) {
        indices.push(lower, upper + segment, upper + next);
      } else if (upperDegenerate) {
        indices.push(lower + segment, lower + next, upper);
      } else {
        indices.push(lower + segment, lower + next, upper + next);
        indices.push(lower + segment, upper + next, upper + segment);
      }
    }
  }

  for (let end = 0; end < 2; end += 1) {
    const ring = end === 0 ? 0 : profile.length - 1;
    if (profile[ring][0] <= 0) continue;
    const start = ringStart[ring];
    const centre = positions.length / 3;
    positions.push(0, profile[ring][1], 0);
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      if (end === 1) {
        indices.push(start + segment, start + next, centre);
      } else {
        indices.push(start + next, start + segment, centre);
      }
    }
  }

  return {
    positions: Float32Array.from(positions),
    indices: Uint32Array.from(indices),
  };
}

/**
 * The first Contract Operator, seeded by reading the eight hand-authored
 * generators rather than by refactoring them. Vase's hollow lathe and Candle's
 * measured pedestal profile are the two that made the shape family obvious: both
 * carry an outer `[radius, height]` profile plus a radial segment count, and both
 * revolve it. This operator carries that algorithm as new code; the originals are
 * untouched and still import nothing from here.
 */
export const PROFILE_LATHE = createContractOperator({
  operatorId: "profile-lathe",
  version: "profile-lathe-v1",
  summary: "revolve one axial [radius, height] profile into a closed capped solid",
  seededFrom: [
    "gt_designer/src/reconstruction/objects/vase-generator.js",
    "gt_designer/src/reconstruction/objects/candle-generator.js",
  ],
  parameterSignature: [
    {
      name: "profile",
      kind: "scalarPairArray",
      description: "outer axial profile as [radius, height] pairs, ordered bottom to top",
      minimumLength: 2,
      maximumLength: 48,
    },
    {
      name: "radialSegments",
      kind: "integer",
      description: "revolution segment count",
      minimum: 3,
      maximum: 64,
    },
  ],
  builder: latheProfile,
  countScalars: (parameters) => parameters.profile.length * 2 + 1,
});

export { latheProfile };
