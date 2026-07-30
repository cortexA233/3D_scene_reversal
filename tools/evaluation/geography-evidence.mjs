/**
 * Geography evidence: terrain, coastline, and Semantic Sea Level.
 *
 * Compares the measured reference elevation field with the candidate's Bounded
 * Semantic Terrain Program directly in world space, reporting height and slope
 * over declared regions, world-space coastline classification and contour
 * distance, and the sea-plane relationships. Regions stay separate so a large
 * correct interior cannot compensate for a wrong shore.
 */

export const GEOGRAPHY_SCHEMA = "geography-evidence-v1";

/** Land/shore/sea classification band around the Semantic Sea Level. */
export const SHORE_BAND = 3;

export function classify(height, seaLevel) {
  if (height < seaLevel - 2) return "sea";
  if (height <= seaLevel + SHORE_BAND) return "shore";
  return "land";
}

function statistics(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction) =>
    sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
  return {
    count: values.length,
    mean: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4)),
    rmse: Number(
      Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length).toFixed(4),
    ),
    p50: Number(percentile(0.5).toFixed(4)),
    p95: Number(percentile(0.95).toFixed(4)),
    max: Number(sorted.at(-1).toFixed(4)),
  };
}

/**
 * Traces the sea-level shoreline as an ordered closed contour. Both subjects
 * use the same sweep so the symmetric contour distance is comparable.
 */
export function traceCoastContour(elevationAt, centre, seaLevel, sweep = 720, maximumRadius = 520) {
  const points = new Array(sweep);
  for (let index = 0; index < sweep; index += 1) {
    const azimuth = (index / sweep) * Math.PI * 2;
    const cos = Math.cos(azimuth);
    const sin = Math.sin(azimuth);
    let found = 0;
    for (let radius = maximumRadius; radius >= 0; radius -= 2) {
      if (elevationAt(centre[0] + cos * radius, centre[1] + sin * radius) >= seaLevel) {
        found = radius;
        break;
      }
    }
    let low = Math.max(0, found - 2);
    let high = found + 2;
    for (let step = 0; step < 20; step += 1) {
      const mid = (low + high) / 2;
      if (elevationAt(centre[0] + cos * mid, centre[1] + sin * mid) >= seaLevel) low = mid;
      else high = mid;
    }
    const radius = (low + high) / 2;
    points[index] = {
      azimuth,
      radius,
      x: centre[0] + cos * radius,
      z: centre[1] + sin * radius,
    };
  }
  return points;
}

export function contourArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    area += a.x * b.z - b.x * a.z;
  }
  return Math.abs(area) / 2;
}

export function contourPerimeter(points) {
  let perimeter = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    perimeter += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return perimeter;
}

/**
 * Inlets are shoreline azimuths that cut well inside the surrounding coast —
 * the bays and channels a plausible overhead silhouette would otherwise hide.
 * Depth is measured against the widest shoreline in the neighbourhood rather
 * than its mean, because the mean is dragged down by the inlet itself.
 */
export function detectInlets(points, depthThreshold = 12, window = 72) {
  const inlets = [];
  const count = points.length;
  for (let index = 0; index < count; index += 1) {
    const local = points[index].radius;
    let surrounding = -Infinity;
    for (let offset = -window; offset <= window; offset += 1) {
      surrounding = Math.max(
        surrounding,
        points[(index + offset + count) % count].radius,
      );
    }
    const depth = surrounding - local;
    if (depth < depthThreshold) continue;
    const previous = points[(index - 1 + count) % count].radius;
    const next = points[(index + 1) % count].radius;
    if (local <= previous && local <= next) {
      inlets.push({
        azimuth: Number(points[index].azimuth.toFixed(4)),
        radius: Number(local.toFixed(3)),
        depth: Number(depth.toFixed(3)),
      });
    }
  }
  return inlets;
}

function symmetricContourDistance(left, right) {
  const nearest = (from, to) =>
    from.map((point) => {
      let best = Infinity;
      for (const other of to) {
        const distance = Math.hypot(point.x - other.x, point.z - other.z);
        if (distance < best) best = distance;
      }
      return best;
    });
  return statistics([...nearest(left, right), ...nearest(right, left)]);
}

/**
 * @param {(x: number, z: number) => number} referenceElevation
 * @param {(x: number, z: number) => number} candidateElevation
 */
export function compareGeography({
  referenceElevation,
  candidateElevation,
  centre,
  seaLevel,
  seaLevelNormal,
  oceanBounds,
  cameraFrusta = [],
  probeResolution = 129,
  probeReach = 460,
}) {
  const regions = { full: [], interior: [], shore: [] };
  const slopeRegions = { full: [], interior: [], shore: [] };
  const classificationCounts = { agree: 0, disagree: 0 };
  const confusion = {};
  const epsilon = 2;

  for (let row = 0; row < probeResolution; row += 1) {
    const z = centre[1] - probeReach + (2 * probeReach * row) / (probeResolution - 1);
    for (let column = 0; column < probeResolution; column += 1) {
      const x = centre[0] - probeReach + (2 * probeReach * column) / (probeResolution - 1);
      const referenceHeight = referenceElevation(x, z);
      const candidateHeight = candidateElevation(x, z);
      const heightError = Math.abs(referenceHeight - candidateHeight);

      const referenceSlope =
        Math.hypot(
          referenceElevation(x + epsilon, z) - referenceHeight,
          referenceElevation(x, z + epsilon) - referenceHeight,
        ) / epsilon;
      const candidateSlope =
        Math.hypot(
          candidateElevation(x + epsilon, z) - candidateHeight,
          candidateElevation(x, z + epsilon) - candidateHeight,
        ) / epsilon;
      const slopeError = Math.abs(referenceSlope - candidateSlope);

      regions.full.push(heightError);
      slopeRegions.full.push(slopeError);
      const zone = classify(referenceHeight, seaLevel);
      if (zone === "land") {
        regions.interior.push(heightError);
        slopeRegions.interior.push(slopeError);
      } else if (zone === "shore") {
        regions.shore.push(heightError);
        slopeRegions.shore.push(slopeError);
      }

      const candidateZone = classify(candidateHeight, seaLevel);
      if (zone === candidateZone) classificationCounts.agree += 1;
      else classificationCounts.disagree += 1;
      const key = `${zone}->${candidateZone}`;
      confusion[key] = (confusion[key] ?? 0) + 1;
    }
  }

  const referenceContour = traceCoastContour(referenceElevation, centre, seaLevel);
  const candidateContour = traceCoastContour(candidateElevation, centre, seaLevel);
  const referenceInlets = detectInlets(referenceContour);
  const candidateInlets = detectInlets(candidateContour);

  const inletMatch = referenceInlets.map((inlet) => {
    const nearest = candidateInlets.reduce((best, other) => {
      const delta = Math.abs(
        Math.atan2(
          Math.sin(other.azimuth - inlet.azimuth),
          Math.cos(other.azimuth - inlet.azimuth),
        ),
      );
      return !best || delta < best.delta ? { other, delta } : best;
    }, null);
    return {
      azimuth: inlet.azimuth,
      depth: inlet.depth,
      matched: Boolean(nearest && nearest.delta <= 0.12),
      azimuthError: nearest ? Number(nearest.delta.toFixed(4)) : null,
      depthError: nearest ? Number(Math.abs(nearest.other.depth - inlet.depth).toFixed(3)) : null,
    };
  });

  const referenceArea = contourArea(referenceContour);
  const candidateArea = contourArea(candidateContour);
  const referencePerimeter = contourPerimeter(referenceContour);
  const candidatePerimeter = contourPerimeter(candidateContour);

  const frustumCoverage = cameraFrusta.map((frustum) => ({
    camera: frustum.name,
    requiredRadius: Number(frustum.radius.toFixed(2)),
    covered:
      oceanBounds !== null &&
      Math.min(
        oceanBounds.max[0] - frustum.centre[0],
        frustum.centre[0] - oceanBounds.min[0],
        oceanBounds.max[2] - frustum.centre[2],
        frustum.centre[2] - oceanBounds.min[2],
      ) >= frustum.radius,
  }));

  return {
    schemaVersion: GEOGRAPHY_SCHEMA,
    probe: { resolution: probeResolution, reach: probeReach, centre },
    height: {
      full: statistics(regions.full),
      interior: statistics(regions.interior),
      shore: statistics(regions.shore),
    },
    slope: {
      full: statistics(slopeRegions.full),
      interior: statistics(slopeRegions.interior),
      shore: statistics(slopeRegions.shore),
    },
    classification: {
      agree: classificationCounts.agree,
      disagree: classificationCounts.disagree,
      agreementFraction: Number(
        (
          classificationCounts.agree /
          Math.max(1, classificationCounts.agree + classificationCounts.disagree)
        ).toFixed(6),
      ),
      confusion,
    },
    coastline: {
      symmetricDistance: symmetricContourDistance(referenceContour, candidateContour),
      referenceArea: Number(referenceArea.toFixed(2)),
      candidateArea: Number(candidateArea.toFixed(2)),
      areaError: Number(Math.abs(referenceArea - candidateArea).toFixed(2)),
      areaRelativeError: Number(
        (Math.abs(referenceArea - candidateArea) / referenceArea).toFixed(6),
      ),
      referencePerimeter: Number(referencePerimeter.toFixed(2)),
      candidatePerimeter: Number(candidatePerimeter.toFixed(2)),
      perimeterRelativeError: Number(
        (Math.abs(referencePerimeter - candidatePerimeter) / referencePerimeter).toFixed(6),
      ),
      radiusError: statistics(
        referenceContour.map((point, index) =>
          Math.abs(point.radius - candidateContour[index].radius),
        ),
      ),
      worstAzimuths: referenceContour
        .map((point, index) => ({
          azimuth: Number(point.azimuth.toFixed(4)),
          error: Math.abs(point.radius - candidateContour[index].radius),
        }))
        .sort((a, b) => b.error - a.error)
        .slice(0, 8)
        .map((row) => ({ azimuth: row.azimuth, error: Number(row.error.toFixed(3)) })),
    },
    inlets: {
      reference: referenceInlets.length,
      candidate: candidateInlets.length,
      matched: inletMatch.filter((row) => row.matched).length,
      rows: inletMatch,
    },
    semanticSeaLevel: {
      height: seaLevel,
      normal: seaLevelNormal,
      heightExact: seaLevel === 16,
      normalExact: JSON.stringify(seaLevelNormal) === JSON.stringify([0, 1, 0]),
      oceanBounds,
      frustumCoverage,
      allFrustaCovered: frustumCoverage.every((row) => row.covered),
    },
  };
}
