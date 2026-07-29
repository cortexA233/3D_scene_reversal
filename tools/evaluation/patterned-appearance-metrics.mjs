const FAMILIES = Object.freeze(["flower", "leaf", "branch"]);

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
