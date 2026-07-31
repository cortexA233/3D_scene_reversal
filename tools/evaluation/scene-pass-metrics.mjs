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
  // A second index pass over the same frame, keyed by Material Family rather
  // than semantic group. The two partitions do not nest: one group can carry
  // several families, and one family spans several groups.
  "materialFamily",
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

  // The distance from a contour to a contour that does not exist is not a
  // distance. `distanceField` leaves its 1e9 sentinel in place for an empty mask,
  // so measuring anyway reports about 1e9 per unmatched contour pixel: a group
  // deleted outright produced a per-group contour p95 of 9.2e7, and a threshold
  // calibrated between mild variation and that would have accepted any candidate
  // at all. Absence is already reported, by an intersection over union of zero and
  // by semantic occupancy, so this returns null rather than a number.
  const referenceContourPixels = referenceContour.reduce((sum, value) => sum + value, 0);
  const candidateContourPixels = candidateContour.reduce((sum, value) => sum + value, 0);
  const comparable = referenceContourPixels > 0 && candidateContourPixels > 0;

  const distances = [];
  if (comparable) {
    const referenceField = distanceField(referenceContour, width, height);
    const candidateField = distanceField(candidateContour, width, height);
    for (let index = 0; index < reference.length; index += 1) {
      if (referenceContour[index]) distances.push(candidateField[index]);
      if (candidateContour[index]) distances.push(referenceField[index]);
    }
  }

  return {
    intersectionOverUnion: union === 0 ? 1 : Number((intersection / union).toFixed(6)),
    referenceOnlyFraction: Number((referenceOnly / reference.length).toFixed(6)),
    candidateOnlyFraction: Number((candidateOnly / reference.length).toFixed(6)),
    contourDistance: comparable ? summarize(distances) : null,
    contourPixels: { reference: referenceContourPixels, candidate: candidateContourPixels },
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

/**
 * Two subjects see the same surface at a pixel when their linear depth agrees to
 * within this many world units.
 *
 * The value is the world-geometry layer's own surface tolerance rounded down:
 * `surface p95` is frozen at 2.3479 world units, so agreeing to within 2 units is
 * already "the same surface" everywhere else in the stack.
 */
export const SURFACE_CORRESPONDENCE_WORLD_UNITS = 2;

/**
 * World-normal error where the two subjects see the same surface.
 *
 * The silhouette intersection is not enough on its own. At scene scale most
 * pixels sit on geometry a pixel or two across — leaves, railings, path stones —
 * so a sub-pixel displacement makes a pixel see a different surface rather than
 * the same surface turned, and the reported angle is then the angle between two
 * unrelated faces. Measured on this island, a 0.15-unit translate produced a
 * per-group p95 of 45.75 degrees and a 1 per cent scale 69.57, with individual
 * groups above 150 degrees, which is a normal that flipped rather than one that
 * rotated. That saturates the metric: mild damage, severe damage, and the real
 * candidate all land in one band, so it can neither separate its own bracket nor
 * say anything about a candidate.
 *
 * Restricting the comparison to pixels whose depth also agrees is what makes the
 * metric mean what its name says — where both subjects put a surface in the same
 * place, do they agree on which way it faces. The unrestricted value is still
 * reported, as a diagnostic, so nothing is hidden by the restriction.
 */
export function worldNormalEvidence(
  referenceRgba,
  candidateRgba,
  width,
  height,
  sharedMask,
  correspondence = null,
) {
  requireRgba(referenceRgba, width, height, "reference world normal");
  requireRgba(candidateRgba, width, height, "candidate world normal");
  const errors = [];
  const allShared = [];
  // Diagnostic companions: the same two sets under unsigned comparison.
  const unsigned = [];
  const allUnsigned = [];
  const range = correspondence ? correspondence.far - correspondence.near : 0;
  const tolerance =
    correspondence?.toleranceWorldUnits ?? SURFACE_CORRESPONDENCE_WORLD_UNITS;
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
    const degrees = (Math.acos(dot) * 180) / Math.PI;
    /**
     * The same comparison treating a normal and its negation as one plane.
     *
     * Diagnostic only — nothing gates on it. ADR-0051 named it as the next refinement and
     * the argument is about what a normal *means* rather than about tolerance: a two-sided
     * surface has no unique outward normal, and this island's worst offenders are exactly
     * those. Vegetation is layered leaf blades and reads 120.7 degrees; three of the five
     * cover populations are two-triangle blades with no thickness at all.
     *
     * Reported beside the signed value rather than replacing it, because the gap between
     * the two *is* the evidence: if the residual is mostly sign flips the unsigned number
     * collapses, and if it is real rotation the two agree. Deciding to gate on it is a
     * separate versioned revision and needs this number first.
     */
    const unsignedDegrees = (Math.acos(Math.abs(dot)) * 180) / Math.PI;
    allShared.push(degrees);
    allUnsigned.push(unsignedDegrees);
    if (correspondence) {
      const referenceDepth =
        decodeLinearDepth(correspondence.referenceDepth, index) * range + correspondence.near;
      const candidateDepth =
        decodeLinearDepth(correspondence.candidateDepth, index) * range + correspondence.near;
      if (Math.abs(referenceDepth - candidateDepth) > tolerance) continue;
    }
    errors.push(degrees);
    unsigned.push(unsignedDegrees);
  }
  if (!correspondence) {
    return {
      comparedPixels: errors.length,
      degrees: summarize(errors),
      unsignedDegrees: summarize(unsigned),
    };
  }
  return {
    comparedPixels: errors.length,
    sharedPixels: allShared.length,
    correspondingFraction:
      allShared.length === 0
        ? null
        : Number((errors.length / allShared.length).toFixed(6)),
    toleranceWorldUnits: tolerance,
    degrees: summarize(errors),
    // What the metric reported before the correspondence restriction. Kept so a
    // restriction that quietly discarded most of the frame is visible rather than
    // reported as agreement.
    allSharedPixelDegrees: summarize(allShared),
    // Unsigned companions, diagnostic. Nothing gates on either.
    unsignedDegrees: summarize(unsigned),
    allSharedPixelUnsignedDegrees: summarize(allUnsigned),
  };
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

/**
 * Appearance evidence, globally and over two independent mask sets.
 *
 * `materialFamilies` is separate from `regions` because a semantic group and a
 * Material Family are different partitions of the same frame: a plaza and a path
 * are two groups sharing one paving material, while one group can carry several
 * families. Gating only groups would let a wrong material pass wherever it is
 * mixed with a right one. Both partitions share this single pass because the
 * CIELAB conversion is the expensive part and running it twice would double the
 * cost of every camera.
 */
export function appearanceEvidence(
  referenceRgba,
  candidateRgba,
  width,
  height,
  regions = {},
  materialFamilies = {},
) {
  requireRgba(referenceRgba, width, height, "reference lit RGB");
  requireRgba(candidateRgba, width, height, "candidate lit RGB");
  const global = [];
  // Entries and per-label buckets are built once. Re-deriving them inside the
  // per-pixel loop allocates an array for every mask for every pixel, which at
  // scene scale costs more than the CIELAB conversion the loop exists for.
  const bucketsFor = (masks) =>
    Object.entries(masks).map(([name, mask]) => ({
      name,
      mask,
      values: [],
      // Each subject's own mean channel over this label's pixels, accumulated in the
      // same pass as the difference. A per-label DeltaE says how wrong a family is;
      // it cannot say in which direction, so nothing could be fitted from it — the
      // Reference-guided Fitting Loop needs to know that a foliage family is too dark
      // rather than merely far away. Both means are over the *same* pixels, so the
      // ratio between them is a correction the loop can apply.
      reference: [0, 0, 0],
      candidate: [0, 0, 0],
    }));
  const regionBuckets = bucketsFor(regions);
  const familyBuckets = bucketsFor(materialFamilies);

  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const left = rgbToLab(referenceRgba[offset], referenceRgba[offset + 1], referenceRgba[offset + 2]);
    const right = rgbToLab(candidateRgba[offset], candidateRgba[offset + 1], candidateRgba[offset + 2]);
    const delta = deltaE76(left, right);
    global.push(delta);
    for (let bucket = 0; bucket < regionBuckets.length; bucket += 1) {
      if (!regionBuckets[bucket].mask[index]) continue;
      regionBuckets[bucket].values.push(delta);
      for (let channel = 0; channel < 3; channel += 1) {
        regionBuckets[bucket].reference[channel] += referenceRgba[offset + channel];
        regionBuckets[bucket].candidate[channel] += candidateRgba[offset + channel];
      }
    }
    for (let bucket = 0; bucket < familyBuckets.length; bucket += 1) {
      if (!familyBuckets[bucket].mask[index]) continue;
      familyBuckets[bucket].values.push(delta);
      for (let channel = 0; channel < 3; channel += 1) {
        familyBuckets[bucket].reference[channel] += referenceRgba[offset + channel];
        familyBuckets[bucket].candidate[channel] += candidateRgba[offset + channel];
      }
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
    // A label with no pixels in this frame is omitted rather than reported as
    // null, so "measured here" stays distinguishable from "present but empty".
    regions: summarizeBuckets(regionBuckets),
    materialFamilies: summarizeBuckets(familyBuckets),
  };
}

function summarizeBuckets(buckets) {
  return Object.fromEntries(
    buckets
      .filter((bucket) => bucket.values.length > 0)
      .map((bucket) => [
        bucket.name,
        {
          ...summarize(bucket.values),
          // Additive, and deliberately so: the aggregate reads only the difference
          // statistics, so adding a direction alongside them leaves every stored
          // capture's gated numbers exactly as they were.
          referenceChannelMeans: bucket.reference.map((sum) =>
            Number((sum / bucket.values.length).toFixed(4)),
          ),
          candidateChannelMeans: bucket.candidate.map((sum) =>
            Number((sum / bucket.values.length).toFixed(4)),
          ),
        },
      ]),
  );
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
          ? worldNormalEvidence(referenceNormal, candidateNormal, width, height, sharedMask, {
              // Orientation is only comparable where both subjects put a surface
              // in the same place; the depth pass is what says whether they did.
              referenceDepth,
              candidateDepth,
              near,
              far,
            })
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
  const worstGroup = (selector, ascending, rowsIn = groupRows) => {
    const rows = rowsIn
      .map((row) => ({ camera: row.camera, label: row.label, value: selector(row) }))
      .filter((row) => Number.isFinite(row.value));
    if (rows.length === 0) return null;
    return rows.sort((a, b) => (ascending ? a.value - b.value : b.value - a.value))[0];
  };
  // Groups compared by distribution rather than by instance pairing, which is what
  // Distributed Scene Cover is defined to be: "reconstructed and compared by
  // semantic occupancy and spatial distribution rather than arbitrary instance
  // pairing". A per-pixel *intersection* is an instance pairing, and on a scatter
  // of one-to-few-pixel instances it saturates: measured through the corrected
  // passes, a mild 0.02-radian yaw of the reference against itself takes cover's
  // IoU to 0.0415 and a mild one per cent scale to 0.1344, against a frozen
  // worst-group threshold of 0.302569. The maximum over every camera and group
  // therefore always finds cover and reports it as the scene's worst failure
  // whatever the island looks like — the same saturation ADR-0051 found in
  // world-normal p95, and repaired the same way, by fixing what the metric
  // compares rather than what it demands.
  //
  // Only the intersection is scoped. Contour *distance* asks how far the nearest
  // candidate cover pixel is, which is a distribution question and not a pairing:
  // measured, cover's own contour bracket separates a mild 17.9 pixels from a
  // severe 268.6, and its depth bracket separates a mild 5.3 world units from a
  // severe 86.5. Both keep cover, and both still gate it.
  const DISTRIBUTION_COMPARED_GROUPS = new Set(["cover"]);
  const pairedRows = groupRows.filter((row) => !DISTRIBUTION_COMPARED_GROUPS.has(row.label));
  const distributedRows = groupRows.filter((row) => DISTRIBUTION_COMPARED_GROUPS.has(row.label));

  // Per-Material-Family appearance across every camera. `sky` is excluded for the
  // same reason it is excluded from the group rows: it is a backdrop that fills
  // every frame for both subjects.
  const familyRows = [];
  for (const view of views) {
    for (const [label, row] of Object.entries(view.appearance?.materialFamilies ?? {})) {
      familyRows.push({ camera: view.camera, label, ...row });
    }
  }
  const worstFamilyRow = familyRows
    .filter((row) => Number.isFinite(row.mean))
    .sort((a, b) => b.mean - a.mean)[0];
  const worstFamily = worstFamilyRow
    ? { camera: worstFamilyRow.camera, label: worstFamilyRow.label, value: worstFamilyRow.mean }
    : null;

  // The largest single mislabelling across every camera, as a fraction of the
  // pixels compared in that camera.
  const confusionRows = [];
  for (const view of views) {
    const compared = view.semantic?.comparedPixels;
    if (!Number.isFinite(compared) || compared === 0) continue;
    for (const [transition, pixels] of Object.entries(view.semantic.confusion ?? {})) {
      const [from, to] = transition.split("->");
      if (from === to) continue;
      confusionRows.push({
        camera: view.camera,
        transition,
        pixels,
        fraction: Number((pixels / compared).toFixed(6)),
      });
    }
  }
  const worstConfusion = confusionRows.sort((a, b) => b.fraction - a.fraction)[0] ?? null;
  // No confusion at all is a fraction of zero, not missing evidence. The gate
  // stack treats a null as "evidence is missing" and fails the metric, so
  // reporting null here would make a subject that mislabels nothing fail the
  // metric that exists to catch mislabelling. Null is reserved for the case where
  // no camera compared any pixels, which really is nothing measured.
  const comparedAnywhere = views.some((view) => view.semantic?.comparedPixels > 0);

  return {
    cameras: views.length,
    groupSilhouetteIoU: {
      // The mean keeps every group, cover included: a scatter that is absent, far
      // too sparse, or far too dense still drags it, and a mean is not a maximum,
      // so one saturated group cannot define it.
      mean:
        summarize(groupRows.map((row) => row.intersectionOverUnion).filter(Number.isFinite))
          ?.mean ?? null,
      worst: worstGroup((row) => row.intersectionOverUnion, true, pairedRows),
      // Reported, never hidden. The gate does not read it, and a review that wants
      // to know what the scatter's per-pixel intersection is can see it here
      // alongside the reason it is not gated.
      worstDistributed: worstGroup((row) => row.intersectionOverUnion, true, distributedRows),
    },
    // Per-group contour distance, for the same reason the per-group IoU exists.
    // The whole-frame silhouette covers everything that is not sky, so its
    // outline is very nearly the frame border and its contour distance sits at 0
    // or 1 pixel on five of the six cameras no matter what the island looks
    // like. A group's outline is the group's own shape.
    groupContourDistance: {
      meanP95:
        summarize(groupRows.map((row) => row.contourDistance?.p95).filter(Number.isFinite))
          ?.mean ?? null,
      worst: worstGroup((row) => row.contourDistance?.p95, false),
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
    // The optional reads below let a view that measured only some of the passes
    // aggregate to `null` for the rest rather than throwing. The calibration run
    // needs that: geometry controls skip the lit-RGB composer pass and appearance
    // controls skip the auxiliary passes, which is most of what keeps a
    // fifteen-control bracket inside an hour of SwiftShader time.
    silhouetteIoU: {
      mean: summarize(values((view) => view.silhouette?.intersectionOverUnion))?.mean ?? null,
      worst: best((view) => view.silhouette?.intersectionOverUnion),
    },
    contourDistance: {
      meanP95: summarize(values((view) => view.silhouette?.contourDistance?.p95))?.mean ?? null,
      worst: worst((view) => view.silhouette?.contourDistance?.p95),
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
      mean: summarize(values((view) => view.semantic?.agreementFraction))?.mean ?? null,
      worst: best((view) => view.semantic?.agreementFraction),
    },
    appearanceDeltaE: {
      meanMean: summarize(values((view) => view.appearance?.deltaE?.mean))?.mean ?? null,
      worst: worst((view) => view.appearance?.deltaE?.mean),
    },
    // A Material Family mixed into a group that scores well is invisible to
    // per-group appearance, so the worst family is kept as its own result.
    appearanceByMaterialFamily: {
      meanMean: summarize(familyRows.map((row) => row.mean).filter(Number.isFinite))?.mean ?? null,
      worst: worstFamily,
    },
    // Agreement counts pixels that match. Confusion names the single largest way
    // they disagree, so one group consistently rendered as another cannot hide
    // inside a high agreement fraction.
    semanticConfusion: {
      worstFraction: worstConfusion
        ? worstConfusion.fraction
        : comparedAnywhere
          ? 0
          : null,
      worst: worstConfusion,
    },
  };
}
