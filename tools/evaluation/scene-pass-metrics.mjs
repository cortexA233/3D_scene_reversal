/**
 * Scene-level pass metrics.
 *
 * Reuses the accepted Single Mesh Lab pass encodings — binary silhouette,
 * linear depth, world normal, albedo and lit RGB — whose meaning is unchanged
 * at scene scale, and adds the scene-specific evidence the Lab never needed:
 * semantic occupancy and confusion across many identities, per-Material-Family
 * appearance, and the sea, sky, and fog layers.
 *
 * The Lab's 38-degree canonical cameras, object normalization, and object
 * thresholds do not transfer and are not used here.
 */

export const SCENE_PASS_SCHEMA = "scene-pass-evidence-v1";

export const SCENE_PASSES = Object.freeze([
  "semantic",
  "silhouette",
  "linearDepth",
  "worldNormal",
  "litRgb",
]);

function requireRgba(buffer, width, height, label) {
  if (!(buffer instanceof Uint8Array)) throw new TypeError(`${label} must be a Uint8Array`);
  if (buffer.length !== width * height * 4) {
    throw new RangeError(`${label} must contain width*height RGBA bytes`);
  }
}

export function binaryMask(rgba) {
  const mask = new Uint8Array(rgba.length / 4);
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4;
    mask[index] = rgba[offset] > 127 || rgba[offset + 1] > 127 || rgba[offset + 2] > 127 ? 1 : 0;
  }
  return mask;
}

function contourMask(mask, width, height) {
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

/** Squared distance transform over the set pixels of a mask. */
function distanceField(mask, width, height) {
  const INF = 1e9;
  const field = new Float64Array(mask.length);
  for (let index = 0; index < mask.length; index += 1) field[index] = mask[index] ? 0 : INF;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (x > 0) field[index] = Math.min(field[index], field[index - 1] + 1);
      if (y > 0) field[index] = Math.min(field[index], field[index - width] + 1);
      if (x > 0 && y > 0) field[index] = Math.min(field[index], field[index - width - 1] + 1.4142);
      if (x < width - 1 && y > 0) {
        field[index] = Math.min(field[index], field[index - width + 1] + 1.4142);
      }
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      if (x < width - 1) field[index] = Math.min(field[index], field[index + 1] + 1);
      if (y < height - 1) field[index] = Math.min(field[index], field[index + width] + 1);
      if (x < width - 1 && y < height - 1) {
        field[index] = Math.min(field[index], field[index + width + 1] + 1.4142);
      }
      if (x > 0 && y < height - 1) {
        field[index] = Math.min(field[index], field[index + width - 1] + 1.4142);
      }
    }
  }
  return field;
}

export function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

function summarize(values) {
  if (values.length === 0) return null;
  const sorted = Float64Array.from(values).sort();
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    count: values.length,
    mean: Number((sum / values.length).toFixed(6)),
    p50: Number(percentile(sorted, 0.5).toFixed(6)),
    p95: Number(percentile(sorted, 0.95).toFixed(6)),
    max: Number(sorted[sorted.length - 1].toFixed(6)),
  };
}

export function silhouetteEvidence(referenceRgba, candidateRgba, width, height) {
  requireRgba(referenceRgba, width, height, "reference silhouette");
  requireRgba(candidateRgba, width, height, "candidate silhouette");
  const reference = binaryMask(referenceRgba);
  const candidate = binaryMask(candidateRgba);

  let intersection = 0;
  let union = 0;
  let referenceOnly = 0;
  let candidateOnly = 0;
  for (let index = 0; index < reference.length; index += 1) {
    if (reference[index] && candidate[index]) intersection += 1;
    if (reference[index] || candidate[index]) union += 1;
    if (reference[index] && !candidate[index]) referenceOnly += 1;
    if (!reference[index] && candidate[index]) candidateOnly += 1;
  }

  const referenceContour = contourMask(reference, width, height);
  const candidateContour = contourMask(candidate, width, height);
  const referenceField = distanceField(referenceContour, width, height);
  const candidateField = distanceField(candidateContour, width, height);
  const distances = [];
  for (let index = 0; index < reference.length; index += 1) {
    if (referenceContour[index]) distances.push(candidateField[index]);
    if (candidateContour[index]) distances.push(referenceField[index]);
  }

  return {
    intersectionOverUnion: union === 0 ? 1 : Number((intersection / union).toFixed(6)),
    referenceOnlyFraction: Number((referenceOnly / reference.length).toFixed(6)),
    candidateOnlyFraction: Number((candidateOnly / reference.length).toFixed(6)),
    contourDistance: summarize(distances),
  };
}

/**
 * Linear depth is encoded as a 24-bit value across RGB so a far horizon and a
 * near path stone are both resolvable.
 */
export function decodeLinearDepth(rgba, index) {
  const offset = index * 4;
  return (
    (rgba[offset] * 65536 + rgba[offset + 1] * 256 + rgba[offset + 2]) / 16777215
  );
}

/**
 * Coverage comes from the silhouette pass, never from the depth pass itself: a
 * near surface encodes as a small value, so treating dark depth pixels as empty
 * would silently drop exactly the foreground the metric is for.
 */
export function depthEvidence(referenceRgba, candidateRgba, width, height, near, far, sharedMask) {
  requireRgba(referenceRgba, width, height, "reference depth");
  requireRgba(candidateRgba, width, height, "candidate depth");
  if (!(sharedMask instanceof Uint8Array) || sharedMask.length !== width * height) {
    throw new TypeError("depthEvidence needs the shared silhouette mask");
  }
  const errors = [];
  const range = far - near;
  for (let index = 0; index < sharedMask.length; index += 1) {
    if (!sharedMask[index]) continue;
    const referenceDepth = decodeLinearDepth(referenceRgba, index) * range + near;
    const candidateDepth = decodeLinearDepth(candidateRgba, index) * range + near;
    errors.push(Math.abs(referenceDepth - candidateDepth));
  }
  return { comparedPixels: errors.length, worldUnits: summarize(errors) };
}

export function worldNormalEvidence(referenceRgba, candidateRgba, width, height, sharedMask) {
  requireRgba(referenceRgba, width, height, "reference world normal");
  requireRgba(candidateRgba, width, height, "candidate world normal");
  const errors = [];
  for (let index = 0; index < sharedMask.length; index += 1) {
    if (!sharedMask[index]) continue;
    const offset = index * 4;
    const decode = (rgba) => {
      const x = (rgba[offset] / 255) * 2 - 1;
      const y = (rgba[offset + 1] / 255) * 2 - 1;
      const z = (rgba[offset + 2] / 255) * 2 - 1;
      const length = Math.hypot(x, y, z) || 1;
      return [x / length, y / length, z / length];
    };
    const left = decode(referenceRgba);
    const right = decode(candidateRgba);
    const dot = Math.min(1, Math.max(-1, left[0] * right[0] + left[1] * right[1] + left[2] * right[2]));
    errors.push((Math.acos(dot) * 180) / Math.PI);
  }
  return { comparedPixels: errors.length, degrees: summarize(errors) };
}

/**
 * Semantic occupancy and confusion.
 *
 * Each pixel carries the semantic group that painted it, so a candidate that
 * fills the right silhouette with the wrong content is visible here even when
 * silhouette IoU is high.
 */
export function semanticEvidence(referenceIds, candidateIds, labels) {
  if (referenceIds.length !== candidateIds.length) {
    throw new RangeError("semantic passes must have the same pixel count");
  }
  const confusion = new Map();
  const referenceCounts = new Map();
  const candidateCounts = new Map();
  let agree = 0;
  let compared = 0;

  for (let index = 0; index < referenceIds.length; index += 1) {
    const left = referenceIds[index];
    const right = candidateIds[index];
    if (left === 0 && right === 0) continue;
    compared += 1;
    referenceCounts.set(left, (referenceCounts.get(left) ?? 0) + 1);
    candidateCounts.set(right, (candidateCounts.get(right) ?? 0) + 1);
    if (left === right) agree += 1;
    else {
      const key = `${labels[left] ?? left}->${labels[right] ?? right}`;
      confusion.set(key, (confusion.get(key) ?? 0) + 1);
    }
  }

  const occupancy = [];
  for (const [id, label] of Object.entries(labels)) {
    const numeric = Number(id);
    if (numeric === 0) continue;
    const referencePixels = referenceCounts.get(numeric) ?? 0;
    const candidatePixels = candidateCounts.get(numeric) ?? 0;
    if (referencePixels === 0 && candidatePixels === 0) continue;
    occupancy.push({
      label,
      referencePixels,
      candidatePixels,
      relativeError:
        referencePixels === 0
          ? null
          : Number((Math.abs(candidatePixels - referencePixels) / referencePixels).toFixed(6)),
    });
  }

  return {
    comparedPixels: compared,
    agreementFraction: compared === 0 ? 1 : Number((agree / compared).toFixed(6)),
    occupancy: occupancy.sort((a, b) => b.referencePixels - a.referencePixels),
    confusion: Object.fromEntries(
      [...confusion.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16),
    ),
  };
}

function srgbToLinear(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function rgbToLab(r, g, b) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;
  const f = (value) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 is enough for scene-scale layer evidence; role gates use DeltaE 2000. */
function deltaE76(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

export function appearanceEvidence(referenceRgba, candidateRgba, width, height, regions = {}) {
  requireRgba(referenceRgba, width, height, "reference lit RGB");
  requireRgba(candidateRgba, width, height, "candidate lit RGB");
  const global = [];
  const perRegion = new Map();

  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const left = rgbToLab(referenceRgba[offset], referenceRgba[offset + 1], referenceRgba[offset + 2]);
    const right = rgbToLab(candidateRgba[offset], candidateRgba[offset + 1], candidateRgba[offset + 2]);
    const delta = deltaE76(left, right);
    global.push(delta);
    for (const [name, mask] of Object.entries(regions)) {
      if (!mask[index]) continue;
      const values = perRegion.get(name) ?? [];
      values.push(delta);
      perRegion.set(name, values);
    }
  }

  const meanChannel = (rgba) => {
    const sums = [0, 0, 0];
    for (let index = 0; index < width * height; index += 1) {
      const offset = index * 4;
      sums[0] += rgba[offset];
      sums[1] += rgba[offset + 1];
      sums[2] += rgba[offset + 2];
    }
    return sums.map((sum) => Number((sum / (width * height)).toFixed(4)));
  };

  return {
    deltaE: summarize(global),
    referenceChannelMeans: meanChannel(referenceRgba),
    candidateChannelMeans: meanChannel(candidateRgba),
    regions: Object.fromEntries(
      [...perRegion.entries()].map(([name, values]) => [name, summarize(values)]),
    ),
  };
}

/**
 * Per-semantic-group geometry evidence.
 *
 * At scene scale a global silhouette is dominated by whichever surfaces happen
 * to fill the frame, so a village of wrong buildings can still score a perfect
 * global IoU behind a correct ocean. Group masks come from the semantic pass,
 * which is what makes the village measurable on its own terms.
 */
export function groupGeometryEvidence({
  referenceIds,
  candidateIds,
  referenceDepth,
  candidateDepth,
  referenceNormal,
  candidateNormal,
  width,
  height,
  near,
  far,
  labels,
}) {
  const rows = {};
  for (const [id, label] of Object.entries(labels)) {
    const numeric = Number(id);
    const referenceMask = new Uint8Array(referenceIds.length);
    const candidateMask = new Uint8Array(candidateIds.length);
    const sharedMask = new Uint8Array(referenceIds.length);
    let referencePixels = 0;
    let candidatePixels = 0;
    let intersection = 0;
    let union = 0;
    for (let index = 0; index < referenceIds.length; index += 1) {
      const left = referenceIds[index] === numeric;
      const right = candidateIds[index] === numeric;
      if (left) {
        referenceMask[index] = 1;
        referencePixels += 1;
      }
      if (right) {
        candidateMask[index] = 1;
        candidatePixels += 1;
      }
      if (left && right) {
        sharedMask[index] = 1;
        intersection += 1;
      }
      if (left || right) union += 1;
    }
    if (referencePixels === 0 && candidatePixels === 0) continue;

    rows[label] = {
      referencePixels,
      candidatePixels,
      intersectionOverUnion: union === 0 ? 1 : Number((intersection / union).toFixed(6)),
      contourDistance: silhouetteEvidence(
        maskToRgba(referenceMask),
        maskToRgba(candidateMask),
        width,
        height,
      ).contourDistance,
      depth:
        intersection > 0
          ? depthEvidence(referenceDepth, candidateDepth, width, height, near, far, sharedMask)
          : null,
      worldNormal:
        intersection > 0
          ? worldNormalEvidence(referenceNormal, candidateNormal, width, height, sharedMask)
          : null,
    };
  }
  return rows;
}

function maskToRgba(mask) {
  const rgba = new Uint8Array(mask.length * 4);
  for (let index = 0; index < mask.length; index += 1) {
    const value = mask[index] ? 255 : 0;
    rgba[index * 4] = value;
    rgba[index * 4 + 1] = value;
    rgba[index * 4 + 2] = value;
    rgba[index * 4 + 3] = 255;
  }
  return rgba;
}

export function aggregateCameras(views) {
  const worst = (selector) => {
    const rows = views
      .map((view) => ({ camera: view.camera, value: selector(view) }))
      .filter((row) => Number.isFinite(row.value));
    if (rows.length === 0) return null;
    return rows.sort((a, b) => b.value - a.value)[0];
  };
  const best = (selector) => {
    const rows = views
      .map((view) => ({ camera: view.camera, value: selector(view) }))
      .filter((row) => Number.isFinite(row.value));
    if (rows.length === 0) return null;
    return rows.sort((a, b) => a.value - b.value)[0];
  };
  const values = (selector) => views.map(selector).filter(Number.isFinite);

  // The worst identity-bearing group across every camera: this is what a global
  // silhouette dominated by sky and ocean cannot express.
  const groupRows = [];
  for (const view of views) {
    for (const [label, row] of Object.entries(view.byGroup ?? {})) {
      if (label === "sky" || label === "environment") continue;
      groupRows.push({ camera: view.camera, label, ...row });
    }
  }
  const worstGroup = (selector, ascending) => {
    const rows = groupRows
      .map((row) => ({ camera: row.camera, label: row.label, value: selector(row) }))
      .filter((row) => Number.isFinite(row.value));
    if (rows.length === 0) return null;
    return rows.sort((a, b) => (ascending ? a.value - b.value : b.value - a.value))[0];
  };

  return {
    cameras: views.length,
    groupSilhouetteIoU: {
      mean:
        summarize(groupRows.map((row) => row.intersectionOverUnion).filter(Number.isFinite))
          ?.mean ?? null,
      worst: worstGroup((row) => row.intersectionOverUnion, true),
    },
    groupDepthWorldUnits: {
      meanP95:
        summarize(groupRows.map((row) => row.depth?.worldUnits?.p95).filter(Number.isFinite))
          ?.mean ?? null,
      worst: worstGroup((row) => row.depth?.worldUnits?.p95, false),
    },
    groupWorldNormalDegrees: {
      meanP95:
        summarize(
          groupRows.map((row) => row.worldNormal?.degrees?.p95).filter(Number.isFinite),
        )?.mean ?? null,
      worst: worstGroup((row) => row.worldNormal?.degrees?.p95, false),
    },
    silhouetteIoU: {
      mean: summarize(values((view) => view.silhouette.intersectionOverUnion))?.mean ?? null,
      worst: best((view) => view.silhouette.intersectionOverUnion),
    },
    contourDistance: {
      meanP95: summarize(values((view) => view.silhouette.contourDistance?.p95))?.mean ?? null,
      worst: worst((view) => view.silhouette.contourDistance?.p95),
    },
    depthWorldUnits: {
      meanP95: summarize(values((view) => view.depth?.worldUnits?.p95))?.mean ?? null,
      worst: worst((view) => view.depth?.worldUnits?.p95),
    },
    worldNormalDegrees: {
      meanP95: summarize(values((view) => view.worldNormal?.degrees?.p95))?.mean ?? null,
      worst: worst((view) => view.worldNormal?.degrees?.p95),
    },
    semanticAgreement: {
      mean: summarize(values((view) => view.semantic.agreementFraction))?.mean ?? null,
      worst: best((view) => view.semantic.agreementFraction),
    },
    appearanceDeltaE: {
      meanMean: summarize(values((view) => view.appearance.deltaE?.mean))?.mean ?? null,
      worst: worst((view) => view.appearance.deltaE?.mean),
    },
  };
}
