const FAMILIES = Object.freeze(["flower", "leaf", "branch"]);

export const HUMAN_ANCHORED_PATTERN_ROLES_V3 = Object.freeze({
  // Fixed RGBA8 albedo-pass values after the evaluation renderer's declared
  // color pipeline, not the production recipe's linear shader uniforms.
  flower: Object.freeze([192, 198, 188]),
  leaf: Object.freeze([16, 38, 32]),
  branch: Object.freeze([9, 17, 14]),
});

function requireRgba(buffer, width, height, label) {
  if (!(buffer instanceof Uint8Array)) {
    throw new TypeError(`${label} must be a Uint8Array`);
  }
  if (buffer.length !== width * height * 4) {
    throw new RangeError(`${label} must contain width*height RGBA bytes`);
  }
}

function silhouetteAt(buffer, pixelIndex) {
  const offset = pixelIndex * 4;
  return (
    buffer[offset] > 127 ||
    buffer[offset + 1] > 127 ||
    buffer[offset + 2] > 127
  );
}

function classify(red, green, blue) {
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const chroma = maximum - minimum;
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  if (luminance >= 165 && maximum >= 190) return "flower";
  if (
    luminance < 165 &&
    green >= red * 1.05 &&
    blue >= red * 0.92 &&
    chroma >= 18
  ) {
    return "leaf";
  }
  if (
    luminance <= 105 &&
    chroma >= 12 &&
    blue >= green * 0.62
  ) {
    return "branch";
  }
  return null;
}

function colorDistance(reference, replacement, offset) {
  return Math.hypot(
    reference[offset] - replacement[offset],
    reference[offset + 1] - replacement[offset + 1],
    reference[offset + 2] - replacement[offset + 2],
  );
}

export function evaluatePatternedAppearanceView({
  width,
  height,
  referenceSilhouette,
  replacementSilhouette,
  referenceAlbedo,
  replacementAlbedo,
  matchDistance = 24,
}) {
  for (const [label, buffer] of [
    ["referenceSilhouette", referenceSilhouette],
    ["replacementSilhouette", replacementSilhouette],
    ["referenceAlbedo", referenceAlbedo],
    ["replacementAlbedo", replacementAlbedo],
  ]) {
    requireRgba(buffer, width, height, label);
  }
  const counts = Object.fromEntries(
    FAMILIES.map((family) => [family, { referencePixels: 0, matchedPixels: 0 }]),
  );
  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    if (
      !silhouetteAt(referenceSilhouette, pixelIndex) ||
      !silhouetteAt(replacementSilhouette, pixelIndex)
    ) {
      continue;
    }
    const offset = pixelIndex * 4;
    const family = classify(
      referenceAlbedo[offset],
      referenceAlbedo[offset + 1],
      referenceAlbedo[offset + 2],
    );
    if (!family) continue;
    counts[family].referencePixels += 1;
    if (colorDistance(referenceAlbedo, replacementAlbedo, offset) <= matchDistance) {
      counts[family].matchedPixels += 1;
    }
  }
  return Object.fromEntries(
    FAMILIES.map((family) => {
      const evidence = counts[family];
      return [
        family,
        {
          ...evidence,
          recall:
            evidence.referencePixels > 0
              ? evidence.matchedPixels / evidence.referencePixels
              : null,
        },
      ];
    }),
  );
}

export function aggregatePatternedAppearanceEvidence(views) {
  if (!Array.isArray(views) || views.length === 0) {
    throw new TypeError("patterned appearance views are required");
  }
  return Object.fromEntries(
    FAMILIES.map((family) => {
      const eligible = views
        .map((view) => view.patterned[family])
        .filter((evidence) => evidence.referencePixels >= 32);
      return [
        `${family}Recall`,
        eligible.length
          ? Math.min(...eligible.map((evidence) => evidence.recall))
          : null,
      ];
    }),
  );
}

function nearestPatternRole(red, green, blue, roles, maximumRoleDistance) {
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const family of FAMILIES) {
    const role = roles[family];
    const distance = Math.hypot(
      red - role[0],
      green - role[1],
      blue - role[2],
    );
    if (distance < nearestDistance) {
      nearest = family;
      nearestDistance = distance;
    }
  }
  return nearestDistance <= maximumRoleDistance
    ? { family: nearest, distance: nearestDistance }
    : null;
}

function emptyCoverageCounts() {
  return Object.fromEntries(
    FAMILIES.map((family) => [
      family,
      {
        referencePixels: 0,
        replacementPixels: 0,
        replacementRgb: [0, 0, 0],
        replacementRoleDistance: 0,
      },
    ]),
  );
}

/**
 * Measure declared motif roles without requiring source and replacement pixels
 * to occupy the same image coordinates. The role palette is deliberately part
 * of the human-anchored v3 contract; this is not a candidate-independent
 * reference metric and must not be substituted into the historical v2 gate.
 */
export function evaluateSemanticPatternCoverageView({
  width,
  height,
  referenceSilhouette,
  replacementSilhouette,
  referenceAlbedo,
  replacementAlbedo,
  roles = HUMAN_ANCHORED_PATTERN_ROLES_V3,
  maximumRoleDistance = 18,
}) {
  for (const [label, buffer] of [
    ["referenceSilhouette", referenceSilhouette],
    ["replacementSilhouette", replacementSilhouette],
    ["referenceAlbedo", referenceAlbedo],
    ["replacementAlbedo", replacementAlbedo],
  ]) {
    requireRgba(buffer, width, height, label);
  }
  const counts = emptyCoverageCounts();
  const replacementPaletteCounts = new Map();
  let referenceSilhouettePixels = 0;
  let replacementSilhouettePixels = 0;
  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    if (silhouetteAt(referenceSilhouette, pixelIndex)) {
      referenceSilhouettePixels += 1;
      const role = nearestPatternRole(
        referenceAlbedo[offset],
        referenceAlbedo[offset + 1],
        referenceAlbedo[offset + 2],
        roles,
        maximumRoleDistance,
      );
      if (role) counts[role.family].referencePixels += 1;
    }
    if (silhouetteAt(replacementSilhouette, pixelIndex)) {
      replacementSilhouettePixels += 1;
      const paletteKey = `${replacementAlbedo[offset]},${replacementAlbedo[offset + 1]},${replacementAlbedo[offset + 2]}`;
      replacementPaletteCounts.set(
        paletteKey,
        (replacementPaletteCounts.get(paletteKey) ?? 0) + 1,
      );
      const role = nearestPatternRole(
        replacementAlbedo[offset],
        replacementAlbedo[offset + 1],
        replacementAlbedo[offset + 2],
        roles,
        maximumRoleDistance,
      );
      if (role) {
        const evidence = counts[role.family];
        evidence.replacementPixels += 1;
        evidence.replacementRgb[0] += replacementAlbedo[offset];
        evidence.replacementRgb[1] += replacementAlbedo[offset + 1];
        evidence.replacementRgb[2] += replacementAlbedo[offset + 2];
        evidence.replacementRoleDistance += role.distance;
      }
    }
  }
  const families = Object.fromEntries(
    FAMILIES.map((family) => {
      const evidence = counts[family];
      return [
        family,
        {
          referencePixels: evidence.referencePixels,
          replacementPixels: evidence.replacementPixels,
          referenceCoverage: referenceSilhouettePixels > 0
            ? evidence.referencePixels / referenceSilhouettePixels
            : null,
          replacementCoverage: replacementSilhouettePixels > 0
            ? evidence.replacementPixels / replacementSilhouettePixels
            : null,
          replacementCentroid: evidence.replacementPixels > 0
            ? evidence.replacementRgb.map((value) => value / evidence.replacementPixels)
            : null,
          meanReplacementRoleDistance: evidence.replacementPixels > 0
            ? evidence.replacementRoleDistance / evidence.replacementPixels
            : null,
        },
      ];
    }),
  );
  const referencePatternPixels = FAMILIES.reduce(
    (sum, family) => sum + counts[family].referencePixels,
    0,
  );
  const replacementPatternPixels = FAMILIES.reduce(
    (sum, family) => sum + counts[family].replacementPixels,
    0,
  );
  return {
    roles: families,
    total: {
      referencePixels: referencePatternPixels,
      replacementPixels: replacementPatternPixels,
      referenceCoverage: referenceSilhouettePixels > 0
        ? referencePatternPixels / referenceSilhouettePixels
        : null,
      replacementCoverage: replacementSilhouettePixels > 0
        ? replacementPatternPixels / replacementSilhouettePixels
        : null,
    },
    silhouettePixels: {
      reference: referenceSilhouettePixels,
      replacement: replacementSilhouettePixels,
    },
    diagnosticReplacementPalette: [...replacementPaletteCounts]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 12)
      .map(([rgb, pixels]) => ({
        rgb: rgb.split(",").map(Number),
        pixels,
      })),
  };
}

export function aggregateSemanticPatternCoverageEvidence(views) {
  if (!Array.isArray(views) || views.length === 0) {
    throw new TypeError("semantic pattern coverage views are required");
  }
  const aggregateRole = (family) => {
    const totals = views.reduce(
      (result, view) => {
        const evidence = view.semanticPattern.roles[family];
        result.referencePixels += evidence.referencePixels;
        result.replacementPixels += evidence.replacementPixels;
        result.replacementRoleDistance +=
          (evidence.meanReplacementRoleDistance ?? 0) * evidence.replacementPixels;
        result.referenceSilhouettePixels +=
          view.semanticPattern.silhouettePixels.reference;
        result.replacementSilhouettePixels +=
          view.semanticPattern.silhouettePixels.replacement;
        return result;
      },
      {
        referencePixels: 0,
        replacementPixels: 0,
        replacementRoleDistance: 0,
        referenceSilhouettePixels: 0,
        replacementSilhouettePixels: 0,
      },
    );
    const referenceCoverage = totals.referenceSilhouettePixels > 0
      ? totals.referencePixels / totals.referenceSilhouettePixels
      : null;
    const replacementCoverage = totals.replacementSilhouettePixels > 0
      ? totals.replacementPixels / totals.replacementSilhouettePixels
      : null;
    return {
      referenceCoverage,
      replacementCoverage,
      coverageRatio: referenceCoverage > 0
        ? replacementCoverage / referenceCoverage
        : null,
      meanReplacementRoleDistance: totals.replacementPixels > 0
        ? totals.replacementRoleDistance / totals.replacementPixels
        : null,
    };
  };
  const roles = Object.fromEntries(
    FAMILIES.map((family) => [family, aggregateRole(family)]),
  );
  const referenceCoverage = FAMILIES.reduce(
    (sum, family) => sum + (roles[family].referenceCoverage ?? 0),
    0,
  );
  const replacementCoverage = FAMILIES.reduce(
    (sum, family) => sum + (roles[family].replacementCoverage ?? 0),
    0,
  );
  return {
    roles,
    total: {
      referenceCoverage,
      replacementCoverage,
      coverageRatio: referenceCoverage > 0
        ? replacementCoverage / referenceCoverage
        : null,
    },
  };
}
