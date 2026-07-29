function requireRgba(buffer, width, height, label) {
  if (!(buffer instanceof Uint8Array)) {
    throw new TypeError(`${label} must be a Uint8Array`);
  }
  if (buffer.length !== width * height * 4) {
    throw new RangeError(`${label} must contain width*height RGBA bytes`);
  }
}

function binaryMask(rgba, width, height) {
  const result = new Uint8Array(width * height);
  for (let index = 0; index < result.length; index += 1) {
    const offset = index * 4;
    result[index] =
      rgba[offset] > 127 || rgba[offset + 1] > 127 || rgba[offset + 2] > 127
        ? 1
        : 0;
  }
  return result;
}

function contour(mask, width, height) {
  const result = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      if (
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1 ||
        !mask[index - 1] ||
        !mask[index + 1] ||
        !mask[index - width] ||
        !mask[index + width]
      ) {
        result[index] = 1;
      }
    }
  }
  return result;
}

function distanceTransform1d(values) {
  const length = values.length;
  const sites = new Int32Array(length);
  const boundaries = new Float64Array(length + 1);
  const distances = new Float64Array(length);
  let siteIndex = 0;
  sites[0] = 0;
  boundaries[0] = -Infinity;
  boundaries[1] = Infinity;

  for (let position = 1; position < length; position += 1) {
    let intersection =
      (values[position] + position * position -
        (values[sites[siteIndex]] + sites[siteIndex] * sites[siteIndex])) /
      (2 * position - 2 * sites[siteIndex]);
    while (intersection <= boundaries[siteIndex]) {
      siteIndex -= 1;
      intersection =
        (values[position] + position * position -
          (values[sites[siteIndex]] + sites[siteIndex] * sites[siteIndex])) /
        (2 * position - 2 * sites[siteIndex]);
    }
    siteIndex += 1;
    sites[siteIndex] = position;
    boundaries[siteIndex] = intersection;
    boundaries[siteIndex + 1] = Infinity;
  }

  siteIndex = 0;
  for (let position = 0; position < length; position += 1) {
    while (boundaries[siteIndex + 1] < position) siteIndex += 1;
    const offset = position - sites[siteIndex];
    distances[position] = offset * offset + values[sites[siteIndex]];
  }
  return distances;
}

function euclideanDistanceTransform(features, width, height) {
  if (!features.some((value) => value !== 0)) {
    const missingDistance = Math.hypot(width, height);
    return new Float64Array(width * height).fill(missingDistance);
  }
  const infinity = 1e20;
  const intermediate = new Float64Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = new Float64Array(width);
    for (let x = 0; x < width; x += 1) {
      row[x] = features[y * width + x] ? 0 : infinity;
    }
    intermediate.set(distanceTransform1d(row), y * width);
  }

  const result = new Float64Array(width * height);
  for (let x = 0; x < width; x += 1) {
    const column = new Float64Array(height);
    for (let y = 0; y < height; y += 1) {
      column[y] = intermediate[y * width + x];
    }
    const distances = distanceTransform1d(column);
    for (let y = 0; y < height; y += 1) {
      result[y * width + x] = Math.sqrt(distances[y]);
    }
  }
  return result;
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(fraction * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function silhouetteEvidence(reference, replacement, width, height) {
  let intersection = 0;
  let union = 0;
  for (let index = 0; index < reference.length; index += 1) {
    if (reference[index] && replacement[index]) intersection += 1;
    if (reference[index] || replacement[index]) union += 1;
  }
  const referenceContour = contour(reference, width, height);
  const replacementContour = contour(replacement, width, height);
  const distanceToReference = euclideanDistanceTransform(
    referenceContour,
    width,
    height,
  );
  const distanceToReplacement = euclideanDistanceTransform(
    replacementContour,
    width,
    height,
  );
  const distances = [];
  for (let index = 0; index < referenceContour.length; index += 1) {
    if (referenceContour[index]) distances.push(distanceToReplacement[index]);
    if (replacementContour[index]) distances.push(distanceToReference[index]);
  }
  return {
    referenceForegroundPixels: reference.reduce((sum, value) => sum + value, 0),
    replacementForegroundPixels: replacement.reduce(
      (sum, value) => sum + value,
      0,
    ),
    intersectionPixels: intersection,
    unionPixels: union,
    iou: union === 0 ? 1 : intersection / union,
    symmetricEdgeMeanPixels:
      distances.length === 0
        ? 0
        : distances.reduce((sum, value) => sum + value, 0) / distances.length,
    symmetricEdgeP95Pixels: percentile(distances, 0.95) ?? 0,
  };
}

function requireBounds(bounds, label) {
  if (!bounds || !Array.isArray(bounds.min) || !Array.isArray(bounds.max)) {
    throw new TypeError(`${label} must provide min and max arrays`);
  }
  if (bounds.min.length !== 3 || bounds.max.length !== 3) {
    throw new TypeError(`${label} min and max must have three components`);
  }
}

function boundsEvidence(reference, replacement) {
  requireBounds(reference, "referenceBounds");
  requireBounds(replacement, "replacementBounds");
  const referenceSize = reference.max.map(
    (value, axis) => value - reference.min[axis],
  );
  const replacementSize = replacement.max.map(
    (value, axis) => value - replacement.min[axis],
  );
  const perAxisRelativeError = referenceSize.map((value, axis) => {
    const absoluteError = Math.abs(replacementSize[axis] - value);
    return Math.abs(value) < 1e-12 ? absoluteError : absoluteError / Math.abs(value);
  });
  const referenceBottomCenter = [
    (reference.min[0] + reference.max[0]) * 0.5,
    reference.min[1],
    (reference.min[2] + reference.max[2]) * 0.5,
  ];
  const replacementBottomCenter = [
    (replacement.min[0] + replacement.max[0]) * 0.5,
    replacement.min[1],
    (replacement.min[2] + replacement.max[2]) * 0.5,
  ];
  return {
    referenceSize,
    replacementSize,
    perAxisRelativeError,
    maxAxisRelativeError: Math.max(...perAxisRelativeError),
    bottomAnchorErrorCanonical: Math.hypot(
      ...referenceBottomCenter.map(
        (value, axis) => replacementBottomCenter[axis] - value,
      ),
    ),
  };
}

function depthEvidence({
  referenceDepth,
  replacementDepth,
  referenceMask,
  replacementMask,
  width,
  height,
  near,
  far,
  canonicalMaxDimension,
}) {
  requireRgba(referenceDepth, width, height, "referenceDepth");
  requireRgba(replacementDepth, width, height, "replacementDepth");
  if (!(far > near) || !(canonicalMaxDimension > 0)) {
    throw new RangeError("depth range and canonical maximum dimension are invalid");
  }
  const errors = [];
  for (let index = 0; index < referenceMask.length; index += 1) {
    if (!referenceMask[index] || !replacementMask[index]) continue;
    const referenceDistance =
      near + (referenceDepth[index * 4] / 255) * (far - near);
    const replacementDistance =
      near + (replacementDepth[index * 4] / 255) * (far - near);
    errors.push(
      Math.abs(replacementDistance - referenceDistance) /
        canonicalMaxDimension,
    );
  }
  return {
    comparedPixels: errors.length,
    mae:
      errors.length === 0
        ? null
        : errors.reduce((sum, value) => sum + value, 0) / errors.length,
    p95: percentile(errors, 0.95),
    normalization: "canonical-max-dimension",
  };
}

function worldNormalEvidence({
  referenceWorldNormal,
  replacementWorldNormal,
  referenceMask,
  replacementMask,
  width,
  height,
}) {
  requireRgba(referenceWorldNormal, width, height, "referenceWorldNormal");
  requireRgba(replacementWorldNormal, width, height, "replacementWorldNormal");
  const errors = [];
  for (let index = 0; index < referenceMask.length; index += 1) {
    if (!referenceMask[index] || !replacementMask[index]) continue;
    const decode = (buffer) => {
      const offset = index * 4;
      const vector = [
        (buffer[offset] / 255) * 2 - 1,
        (buffer[offset + 1] / 255) * 2 - 1,
        (buffer[offset + 2] / 255) * 2 - 1,
      ];
      const length = Math.hypot(...vector);
      return vector.map((value) => value / length);
    };
    const reference = decode(referenceWorldNormal);
    const replacement = decode(replacementWorldNormal);
    const dot = Math.max(
      -1,
      Math.min(
        1,
        reference.reduce(
          (sum, value, axis) => sum + value * replacement[axis],
          0,
        ),
      ),
    );
    errors.push(degrees(Math.acos(dot)));
  }
  return {
    comparedPixels: errors.length,
    meanDegrees:
      errors.length === 0
        ? null
        : errors.reduce((sum, value) => sum + value, 0) / errors.length,
    p95Degrees: percentile(errors, 0.95),
  };
}

function degrees(value) {
  return (value * 180) / Math.PI;
}

function radians(value) {
  return (value * Math.PI) / 180;
}

function hueDegrees(a, b) {
  if (a === 0 && b === 0) return 0;
  const value = degrees(Math.atan2(b, a));
  return value >= 0 ? value : value + 360;
}

export function deltaE00(first, second) {
  const [l1, a1, b1] = first;
  const [l2, a2, b2] = second;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const meanC = (c1 + c2) * 0.5;
  const meanC7 = meanC ** 7;
  const g = 0.5 * (1 - Math.sqrt(meanC7 / (meanC7 + 25 ** 7)));
  const a1Prime = (1 + g) * a1;
  const a2Prime = (1 + g) * a2;
  const c1Prime = Math.hypot(a1Prime, b1);
  const c2Prime = Math.hypot(a2Prime, b2);
  const h1Prime = hueDegrees(a1Prime, b1);
  const h2Prime = hueDegrees(a2Prime, b2);
  const deltaLPrime = l2 - l1;
  const deltaCPrime = c2Prime - c1Prime;
  let deltaHPrimeDegrees;
  if (c1Prime * c2Prime === 0) {
    deltaHPrimeDegrees = 0;
  } else if (Math.abs(h2Prime - h1Prime) <= 180) {
    deltaHPrimeDegrees = h2Prime - h1Prime;
  } else if (h2Prime <= h1Prime) {
    deltaHPrimeDegrees = h2Prime - h1Prime + 360;
  } else {
    deltaHPrimeDegrees = h2Prime - h1Prime - 360;
  }
  const deltaHPrime =
    2 *
    Math.sqrt(c1Prime * c2Prime) *
    Math.sin(radians(deltaHPrimeDegrees * 0.5));
  const meanLPrime = (l1 + l2) * 0.5;
  const meanCPrime = (c1Prime + c2Prime) * 0.5;
  let meanHPrime;
  if (c1Prime * c2Prime === 0) {
    meanHPrime = h1Prime + h2Prime;
  } else if (Math.abs(h1Prime - h2Prime) <= 180) {
    meanHPrime = (h1Prime + h2Prime) * 0.5;
  } else if (h1Prime + h2Prime < 360) {
    meanHPrime = (h1Prime + h2Prime + 360) * 0.5;
  } else {
    meanHPrime = (h1Prime + h2Prime - 360) * 0.5;
  }
  const t =
    1 -
    0.17 * Math.cos(radians(meanHPrime - 30)) +
    0.24 * Math.cos(radians(2 * meanHPrime)) +
    0.32 * Math.cos(radians(3 * meanHPrime + 6)) -
    0.2 * Math.cos(radians(4 * meanHPrime - 63));
  const deltaTheta =
    30 * Math.exp(-(((meanHPrime - 275) / 25) ** 2));
  const meanCPrime7 = meanCPrime ** 7;
  const rC = 2 * Math.sqrt(meanCPrime7 / (meanCPrime7 + 25 ** 7));
  const lOffset = meanLPrime - 50;
  const sL = 1 + (0.015 * lOffset * lOffset) / Math.sqrt(20 + lOffset * lOffset);
  const sC = 1 + 0.045 * meanCPrime;
  const sH = 1 + 0.015 * meanCPrime * t;
  const rT = -Math.sin(radians(2 * deltaTheta)) * rC;
  const lTerm = deltaLPrime / sL;
  const cTerm = deltaCPrime / sC;
  const hTerm = deltaHPrime / sH;
  return Math.sqrt(
    lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + rT * cTerm * hTerm,
  );
}

function srgbChannelToLinear(value) {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearRgbToLab(red, green, blue) {
  const x = (0.4124564 * red + 0.3575761 * green + 0.1804375 * blue) / 0.95047;
  const y = 0.2126729 * red + 0.7151522 * green + 0.072175 * blue;
  const z = (0.0193339 * red + 0.119192 * green + 0.9503041 * blue) / 1.08883;
  const transform = (value) =>
    value > 216 / 24389
      ? Math.cbrt(value)
      : (24389 / 27) * value / 116 + 16 / 116;
  const fx = transform(x);
  const fy = transform(y);
  const fz = transform(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function pixelEvidence(rgba, index) {
  const offset = index * 4;
  const red = srgbChannelToLinear(rgba[offset]);
  const green = srgbChannelToLinear(rgba[offset + 1]);
  const blue = srgbChannelToLinear(rgba[offset + 2]);
  return {
    lab: linearRgbToLab(red, green, blue),
    luminance: 0.2126 * red + 0.7152 * green + 0.0722 * blue,
  };
}

function erode(mask, width, height, radius) {
  if (radius === 0) return mask.slice();
  const result = new Uint8Array(mask.length);
  for (let y = radius; y < height - radius; y += 1) {
    for (let x = radius; x < width - radius; x += 1) {
      let keep = true;
      for (let dy = -radius; dy <= radius && keep; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (!mask[(y + dy) * width + x + dx]) {
            keep = false;
            break;
          }
        }
      }
      if (keep) result[y * width + x] = 1;
    }
  }
  return result;
}

function maskedSsim(first, second) {
  if (first.length === 0) return null;
  const meanFirst = first.reduce((sum, value) => sum + value, 0) / first.length;
  const meanSecond = second.reduce((sum, value) => sum + value, 0) / second.length;
  let varianceFirst = 0;
  let varianceSecond = 0;
  let covariance = 0;
  for (let index = 0; index < first.length; index += 1) {
    const firstOffset = first[index] - meanFirst;
    const secondOffset = second[index] - meanSecond;
    varianceFirst += firstOffset * firstOffset;
    varianceSecond += secondOffset * secondOffset;
    covariance += firstOffset * secondOffset;
  }
  varianceFirst /= first.length;
  varianceSecond /= first.length;
  covariance /= first.length;
  const c1 = 0.01 ** 2;
  const c2 = 0.03 ** 2;
  return (
    ((2 * meanFirst * meanSecond + c1) * (2 * covariance + c2)) /
    ((meanFirst ** 2 + meanSecond ** 2 + c1) *
      (varianceFirst + varianceSecond + c2))
  );
}

function colorMetrics(reference, replacement, comparedIndices) {
  const errors = [];
  const referenceLuminance = [];
  const replacementLuminance = [];
  for (const index of comparedIndices) {
    const first = pixelEvidence(reference, index);
    const second = pixelEvidence(replacement, index);
    errors.push(deltaE00(first.lab, second.lab));
    referenceLuminance.push(first.luminance);
    replacementLuminance.push(second.luminance);
  }
  return {
    meanDeltaE00:
      errors.length === 0
        ? null
        : errors.reduce((sum, value) => sum + value, 0) / errors.length,
    p90DeltaE00: percentile(errors, 0.9),
    maskedSsim: maskedSsim(referenceLuminance, replacementLuminance),
  };
}

function paletteBins(rgba, comparedIndices) {
  const bins = new Map();
  for (const index of comparedIndices) {
    const offset = index * 4;
    const red = rgba[offset];
    const green = rgba[offset + 1];
    const blue = rgba[offset + 2];
    const key = `${red >> 3}:${green >> 3}:${blue >> 3}`;
    const bin = bins.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
    bin.count += 1;
    bin.red += red;
    bin.green += green;
    bin.blue += blue;
    bins.set(key, bin);
  }
  return Array.from(bins, ([key, bin]) => {
    const red = bin.red / bin.count;
    const green = bin.green / bin.count;
    const blue = bin.blue / bin.count;
    return {
      key,
      count: bin.count,
      lab: linearRgbToLab(
        srgbChannelToLinear(red),
        srgbChannelToLinear(green),
        srgbChannelToLinear(blue),
      ),
    };
  });
}

function dominantPalette(rgba, comparedIndices, colorCount) {
  const bins = paletteBins(rgba, comparedIndices);
  if (bins.length === 0 || colorCount === 0) return [];
  bins.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  let centroids = bins.slice(0, colorCount).map((bin) => [...bin.lab]);
  let clusters = [];
  for (let iteration = 0; iteration < 8; iteration += 1) {
    clusters = Array.from({ length: colorCount }, () => ({
      count: 0,
      sums: [0, 0, 0],
    }));
    for (const bin of bins) {
      let bestIndex = 0;
      let bestDistance = Infinity;
      for (let index = 0; index < centroids.length; index += 1) {
        const distance = Math.hypot(
          bin.lab[0] - centroids[index][0],
          bin.lab[1] - centroids[index][1],
          bin.lab[2] - centroids[index][2],
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      }
      clusters[bestIndex].count += bin.count;
      for (let axis = 0; axis < 3; axis += 1) {
        clusters[bestIndex].sums[axis] += bin.lab[axis] * bin.count;
      }
    }
    centroids = clusters.map((cluster, index) =>
      cluster.count === 0
        ? centroids[index]
        : cluster.sums.map((sum) => sum / cluster.count),
    );
  }
  const total = clusters.reduce((sum, cluster) => sum + cluster.count, 0);
  return centroids.map((lab, index) => ({
    lab,
    coverage: clusters[index].count / total,
  }));
}

function bestPaletteAssignment(reference, replacement) {
  let best = null;
  function visit(assignment, remaining) {
    if (remaining.length === 0) {
      const cost = assignment.reduce(
        (sum, replacementIndex, referenceIndex) =>
          sum +
          deltaE00(
            reference[referenceIndex].lab,
            replacement[replacementIndex].lab,
          ),
        0,
      );
      if (!best || cost < best.cost) best = { cost, assignment: [...assignment] };
      return;
    }
    for (const replacementIndex of remaining) {
      visit(
        [...assignment, replacementIndex],
        remaining.filter((value) => value !== replacementIndex),
      );
    }
  }
  visit([], replacement.map((_, index) => index));
  return best?.assignment ?? [];
}

function paletteMetrics(referenceRgba, replacementRgba, comparedIndices) {
  const referenceBinCount = paletteBins(referenceRgba, comparedIndices).length;
  const replacementBinCount = paletteBins(replacementRgba, comparedIndices).length;
  const colorCount = Math.min(5, referenceBinCount, replacementBinCount);
  if (colorCount === 0) {
    return { colorCount: 0, centroidDeltaE00: null, coverageL1: null };
  }
  const reference = dominantPalette(referenceRgba, comparedIndices, colorCount);
  const replacement = dominantPalette(replacementRgba, comparedIndices, colorCount);
  const assignment = bestPaletteAssignment(reference, replacement);
  let centroidDelta = 0;
  let coverageDifference = 0;
  for (let index = 0; index < reference.length; index += 1) {
    const matched = replacement[assignment[index]];
    centroidDelta +=
      reference[index].coverage * deltaE00(reference[index].lab, matched.lab);
    coverageDifference += Math.abs(
      reference[index].coverage - matched.coverage,
    );
  }
  return {
    colorCount,
    centroidDeltaE00: centroidDelta,
    coverageL1: coverageDifference * 0.5,
  };
}

export function evaluateAppearanceView({
  width,
  height,
  referenceSilhouette,
  replacementSilhouette,
  referenceAlbedo,
  replacementAlbedo,
  referenceLitRgb,
  replacementLitRgb,
  referenceMaterial,
  replacementMaterial,
  erosionRadius = 2,
}) {
  for (const [label, buffer] of [
    ["referenceSilhouette", referenceSilhouette],
    ["replacementSilhouette", replacementSilhouette],
    ["referenceAlbedo", referenceAlbedo],
    ["replacementAlbedo", replacementAlbedo],
    ["referenceLitRgb", referenceLitRgb],
    ["replacementLitRgb", replacementLitRgb],
  ]) {
    requireRgba(buffer, width, height, label);
  }
  if (!Number.isInteger(erosionRadius) || erosionRadius < 0) {
    throw new RangeError("erosionRadius must be a non-negative integer");
  }
  const referenceMask = binaryMask(referenceSilhouette, width, height);
  const replacementMask = binaryMask(replacementSilhouette, width, height);
  const intersection = new Uint8Array(width * height);
  for (let index = 0; index < intersection.length; index += 1) {
    intersection[index] = referenceMask[index] && replacementMask[index] ? 1 : 0;
  }
  const comparisonMask = erode(intersection, width, height, erosionRadius);
  const comparedIndices = [];
  for (let index = 0; index < comparisonMask.length; index += 1) {
    if (comparisonMask[index]) comparedIndices.push(index);
  }
  return {
    comparedPixels: comparedIndices.length,
    erosionRadiusPixels: erosionRadius,
    albedo: colorMetrics(referenceAlbedo, replacementAlbedo, comparedIndices),
    litRgb: colorMetrics(referenceLitRgb, replacementLitRgb, comparedIndices),
    palette: paletteMetrics(referenceAlbedo, replacementAlbedo, comparedIndices),
    material: {
      roughnessAbsoluteError: Math.abs(
        replacementMaterial.roughness - referenceMaterial.roughness,
      ),
      metalnessAbsoluteError: Math.abs(
        replacementMaterial.metalness - referenceMaterial.metalness,
      ),
    },
  };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function valuesAt(views, selector) {
  return views.map(selector).filter((value) => value !== null && value !== undefined);
}

function requireViews(views) {
  if (!Array.isArray(views) || views.length === 0) {
    throw new TypeError("views must contain at least one evaluated view");
  }
}

export function aggregateGeometryEvidence(views) {
  requireViews(views);
  const ious = valuesAt(views, (view) => view.geometry.silhouette.iou);
  const edgeMeans = valuesAt(
    views,
    (view) => view.geometry.silhouette.symmetricEdgeMeanPixels,
  );
  const edgeP95s = valuesAt(
    views,
    (view) => view.geometry.silhouette.symmetricEdgeP95Pixels,
  );
  const depthMeans = valuesAt(views, (view) => view.geometry.depth?.mae);
  const depthP95s = valuesAt(views, (view) => view.geometry.depth?.p95);
  const normalMeans = valuesAt(
    views,
    (view) => view.geometry.worldNormal?.meanDegrees,
  );
  const normalP95s = valuesAt(
    views,
    (view) => view.geometry.worldNormal?.p95Degrees,
  );
  return {
    viewCount: views.length,
    geometry: {
      bounds: {
        maxAxisRelativeError: Math.max(
          ...valuesAt(
            views,
            (view) => view.geometry.bounds.maxAxisRelativeError,
          ),
        ),
        bottomAnchorErrorCanonical: Math.max(
          ...valuesAt(
            views,
            (view) => view.geometry.bounds.bottomAnchorErrorCanonical,
          ),
        ),
      },
      silhouette: {
        meanIou: mean(ious),
        worstViewIou: Math.min(...ious),
        meanEdgeDistancePixels: mean(edgeMeans),
        edgeDistanceP95Pixels: Math.max(...edgeP95s),
      },
      depth: {
        mae: mean(depthMeans),
        p95: Math.max(...depthP95s),
      },
      worldNormal: {
        meanDegrees: normalMeans.length ? mean(normalMeans) : null,
        p95Degrees: normalP95s.length ? Math.max(...normalP95s) : null,
      },
    },
  };
}

export function aggregateAppearanceEvidence(views) {
  requireViews(views);
  const albedoDeltaMeans = valuesAt(
    views,
    (view) => view.appearance.albedo.meanDeltaE00,
  );
  const litDeltaMeans = valuesAt(
    views,
    (view) => view.appearance.litRgb.meanDeltaE00,
  );
  const albedoDeltaP90 = valuesAt(
    views,
    (view) => view.appearance.albedo.p90DeltaE00,
  );
  const litDeltaP90 = valuesAt(
    views,
    (view) => view.appearance.litRgb.p90DeltaE00,
  );
  const albedoSsim = valuesAt(
    views,
    (view) => view.appearance.albedo.maskedSsim,
  );
  const litSsim = valuesAt(
    views,
    (view) => view.appearance.litRgb.maskedSsim,
  );
  return {
    viewCount: views.length,
    appearance: {
      meanDeltaE00: Math.max(
        mean(albedoDeltaMeans),
        mean(litDeltaMeans),
      ),
      p90DeltaE00: Math.max(
        Math.max(...albedoDeltaP90),
        Math.max(...litDeltaP90),
      ),
      meanMaskedSsim: Math.min(mean(albedoSsim), mean(litSsim)),
      worstViewSsim: Math.min(...albedoSsim, ...litSsim),
      paletteCentroidDeltaE00: Math.max(
        ...valuesAt(
          views,
          (view) => view.appearance.palette.centroidDeltaE00,
        ),
      ),
      paletteCoverageL1: Math.max(
        ...valuesAt(views, (view) => view.appearance.palette.coverageL1),
      ),
      roughnessAbsoluteError: Math.max(
        ...valuesAt(
          views,
          (view) => view.appearance.material.roughnessAbsoluteError,
        ),
      ),
      metalnessAbsoluteError: Math.max(
        ...valuesAt(
          views,
          (view) => view.appearance.material.metalnessAbsoluteError,
        ),
      ),
      passPolicy:
        "Color and SSIM use the worse aggregate of albedo and frozen-lighting RGB; palette uses albedo.",
    },
  };
}

export function aggregateVisualEvidence(views) {
  const geometry = aggregateGeometryEvidence(views);
  const appearance = aggregateAppearanceEvidence(views);
  return {
    viewCount: views.length,
    geometry: geometry.geometry,
    appearance: appearance.appearance,
  };
}

export const QUALITY_BASELINE_VERSION = "single-mesh-quality-baseline-v1";

const GEOMETRY_THRESHOLDS = {
  "stone-path": [0.95, 0.92, 1.5, 4, 0.015, 0.04],
  stone: [0.92, 0.88, 2.5, 7, 0.025, 0.07],
  vase: [0.95, 0.92, 1.5, 4, 0.015, 0.04],
  umbrella: [0.9, 0.84, 2.5, 8, 0.03, 0.08],
};

const APPEARANCE_THRESHOLDS = {
  "stone-path": [4, 8, 0.95, 0.92, 3, 0.08],
  stone: [4, 8, 0.95, 0.92, 3, 0.08],
  vase: [8, 18, 0.82, 0.75, 6, 0.15],
  umbrella: [10, 22, 0.78, 0.68, 8, 0.2],
};

export function qualityBaselineDefinition() {
  return {
    version: QUALITY_BASELINE_VERSION,
    geometry: Object.fromEntries(
      Object.entries(GEOMETRY_THRESHOLDS).map(([objectId, values]) => [
        objectId,
        {
          meanSilhouetteIouMinimum: values[0],
          worstViewIouMinimum: values[1],
          meanSymmetricEdgeDistancePixelsMaximum: values[2],
          edgeDistanceP95PixelsMaximum: values[3],
          depthMaeMaximum: values[4],
          depthP95Maximum: values[5],
        },
      ]),
    ),
    appearance: Object.fromEntries(
      Object.entries(APPEARANCE_THRESHOLDS).map(([objectId, values]) => [
        objectId,
        {
          meanDeltaE00Maximum: values[0],
          p90DeltaE00Maximum: values[1],
          meanMaskedSsimMinimum: values[2],
          worstViewSsimMinimum: values[3],
          paletteCentroidDeltaE00Maximum: values[4],
          paletteCoverageL1Maximum: values[5],
        },
      ]),
    ),
    common: {
      maxAxisRelativeErrorMaximum: 0.02,
      bottomAnchorErrorCanonicalMaximum: 0.02,
      roughnessAbsoluteErrorMaximum: 0.1,
      metalnessAbsoluteErrorMaximum: 0.05,
    },
  };
}

function thresholdRecords(objectId) {
  const geometry = GEOMETRY_THRESHOLDS[objectId];
  const appearance = APPEARANCE_THRESHOLDS[objectId];
  if (!geometry || !appearance) {
    throw new Error(`No frozen Stage 1 quality baseline for ${objectId}`);
  }
  return [
    ["geometry.bounds.maxAxisRelativeError", "<=", 0.02],
    ["geometry.bounds.bottomAnchorErrorCanonical", "<=", 0.02],
    ["geometry.silhouette.meanIou", ">=", geometry[0]],
    ["geometry.silhouette.worstViewIou", ">=", geometry[1]],
    ["geometry.silhouette.meanEdgeDistancePixels", "<=", geometry[2]],
    ["geometry.silhouette.edgeDistanceP95Pixels", "<=", geometry[3]],
    ["geometry.depth.mae", "<=", geometry[4]],
    ["geometry.depth.p95", "<=", geometry[5]],
    ["appearance.meanDeltaE00", "<=", appearance[0]],
    ["appearance.p90DeltaE00", "<=", appearance[1]],
    ["appearance.meanMaskedSsim", ">=", appearance[2]],
    ["appearance.worstViewSsim", ">=", appearance[3]],
    ["appearance.paletteCentroidDeltaE00", "<=", appearance[4]],
    ["appearance.paletteCoverageL1", "<=", appearance[5]],
    ["appearance.roughnessAbsoluteError", "<=", 0.1],
    ["appearance.metalnessAbsoluteError", "<=", 0.05],
  ];
}

function getPath(value, path) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

export function evaluateQualityGate(objectId, aggregate) {
  const records = thresholdRecords(objectId);
  const evaluate = (selected) => {
    const failures = [];
    for (const [metric, operator, threshold] of selected) {
      const actual = getPath(aggregate, metric);
      if (!Number.isFinite(actual)) {
        failures.push({ metric, actual, operator, threshold });
        continue;
      }
      const passed = operator === ">=" ? actual >= threshold : actual <= threshold;
      if (!passed) failures.push({ metric, actual, operator, threshold });
    }
    return failures;
  };
  const geometryFailures = evaluate(
    records.filter(([metric]) => metric.startsWith("geometry.")),
  );
  if (geometryFailures.length > 0) {
    return {
      baselineVersion: QUALITY_BASELINE_VERSION,
      objectId,
      passed: false,
      failures: geometryFailures,
      geometryGate: { passed: false, failures: geometryFailures },
      appearanceGate: {
        evaluated: false,
        passed: null,
        reason: "geometry-gate-failed",
        failures: [],
      },
    };
  }
  const appearanceFailures = evaluate(
    records.filter(([metric]) => metric.startsWith("appearance.")),
  );
  return {
    baselineVersion: QUALITY_BASELINE_VERSION,
    objectId,
    passed: appearanceFailures.length === 0,
    failures: appearanceFailures,
    geometryGate: { passed: true, failures: [] },
    appearanceGate: {
      evaluated: true,
      passed: appearanceFailures.length === 0,
      reason: null,
      failures: appearanceFailures,
    },
  };
}

export function evaluateGeometryView({
  width,
  height,
  referenceSilhouette,
  replacementSilhouette,
  referenceDepth = null,
  replacementDepth = null,
  depthNear = 0,
  depthFar = 1,
  canonicalMaxDimension = 1,
  referenceWorldNormal = null,
  replacementWorldNormal = null,
  referenceBounds,
  replacementBounds,
}) {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError("width and height must be positive integers");
  }
  requireRgba(referenceSilhouette, width, height, "referenceSilhouette");
  requireRgba(replacementSilhouette, width, height, "replacementSilhouette");
  const referenceMask = binaryMask(referenceSilhouette, width, height);
  const replacementMask = binaryMask(replacementSilhouette, width, height);
  if (Boolean(referenceDepth) !== Boolean(replacementDepth)) {
    throw new TypeError("referenceDepth and replacementDepth must be provided together");
  }
  if (Boolean(referenceWorldNormal) !== Boolean(replacementWorldNormal)) {
    throw new TypeError(
      "referenceWorldNormal and replacementWorldNormal must be provided together",
    );
  }
  return {
    bounds: boundsEvidence(referenceBounds, replacementBounds),
    silhouette: silhouetteEvidence(
      referenceMask,
      replacementMask,
      width,
      height,
    ),
    depth: referenceDepth
      ? depthEvidence({
          referenceDepth,
          replacementDepth,
          referenceMask,
          replacementMask,
          width,
          height,
          near: depthNear,
          far: depthFar,
          canonicalMaxDimension,
        })
      : null,
    worldNormal: referenceWorldNormal
      ? worldNormalEvidence({
          referenceWorldNormal,
          replacementWorldNormal,
          referenceMask,
          replacementMask,
          width,
          height,
        })
      : null,
  };
}

export { percentile };
