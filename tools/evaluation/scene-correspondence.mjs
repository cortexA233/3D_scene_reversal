import { surfaceDistance } from "./surface-sampling.mjs";

/**
 * Structural correspondence, world layout, and topology-independent surface
 * evidence between two scene observations.
 *
 * Every family keeps aggregate plus worst-case results and stays separate: no
 * weighted score is produced here, so a good average can never stand in for a
 * missing entity, a displaced landmark, or a failed worst view.
 */

export const CORRESPONDENCE_SCHEMA = "scene-correspondence-v1";

/** Nearest-neighbour count used for relational layout evidence. */
const NEIGHBOURHOOD = 6;
/** World-unit tolerance for the over-tolerance surface area fraction. */
export const SURFACE_TOLERANCE = 1;
/**
 * Relative bearing is a compass direction, so it is undefined between entities
 * that share a footprint — a lantern stacked directly above another would
 * report a half-turn error from rounding alone. Bearing evidence therefore uses
 * only horizontally separated neighbours, while distance evidence uses every
 * neighbour.
 */
const MINIMUM_BEARING_SEPARATION = 1;

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function horizontalDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function bearing(from, to) {
  return Math.atan2(to[0] - from[0], to[2] - from[2]);
}

function angleDelta(left, right, modulo = Math.PI * 2) {
  const raw = Math.abs(left - right) % modulo;
  return Math.min(raw, modulo - raw);
}

/**
 * Orientation error under the entity's declared equivalence: a directed
 * heading compares over a full turn, an undirected axis over a half turn, and
 * a radial entity has no yaw gate at all.
 */
export function orientationError(reference, candidate) {
  if (reference.type !== candidate.type) return { type: "mismatch", error: null };
  if (reference.type === "radial") return { type: "radial", error: 0 };
  const modulo = reference.type === "axis" ? Math.PI : Math.PI * 2;
  return {
    type: reference.type,
    error: angleDelta(reference.radians, candidate.radians, modulo),
  };
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

function worst(rows, key, limit = 8) {
  return [...rows]
    .filter((row) => Number.isFinite(row[key]))
    .sort((a, b) => b[key] - a[key])
    .slice(0, limit)
    .map((row) => ({ semanticId: row.semanticId, [key]: Number(row[key].toFixed(4)) }));
}

function structuralCorrespondence(reference, candidate) {
  const referenceIds = new Set(reference.entities.keys());
  const candidateIds = new Set(candidate.entities.keys());
  const missing = [...referenceIds].filter((id) => !candidateIds.has(id));
  const extra = [...candidateIds].filter((id) => !referenceIds.has(id));
  const typeMismatch = [];
  for (const id of referenceIds) {
    if (!candidateIds.has(id)) continue;
    const left = reference.entities.get(id);
    const right = candidate.entities.get(id);
    if (left.kind !== right.kind || left.group !== right.group) {
      typeMismatch.push({
        semanticId: id,
        reference: `${left.group}/${left.kind}`,
        candidate: `${right.group}/${right.kind}`,
      });
    }
  }
  return {
    referenceEntities: referenceIds.size,
    candidateEntities: candidateIds.size,
    missing,
    extra,
    typeMismatch,
    passed: missing.length === 0 && extra.length === 0 && typeMismatch.length === 0,
  };
}

function neighbourhoodOf(entities, semanticId) {
  const origin = entities.get(semanticId);
  return [...entities.values()]
    .filter((entity) => entity.semanticId !== semanticId)
    .map((entity) => ({
      semanticId: entity.semanticId,
      distance: distance(origin.anchor, entity.anchor),
      horizontalDistance: horizontalDistance(origin.anchor, entity.anchor),
      bearing: bearing(origin.anchor, entity.anchor),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, NEIGHBOURHOOD);
}

function zoneKey(anchor, sceneAnchor, size) {
  return `${Math.floor((anchor[0] - sceneAnchor[0]) / size)}:${Math.floor(
    (anchor[2] - sceneAnchor[2]) / size,
  )}`;
}

function zoneOccupancy(entities, sceneAnchor, size) {
  const zones = new Map();
  for (const entity of entities.values()) {
    const key = zoneKey(entity.anchor, sceneAnchor, size);
    zones.set(key, (zones.get(key) ?? 0) + 1);
  }
  return zones;
}

export function compareScenes(reference, candidate, options = {}) {
  const sceneAnchor = options.sceneAnchor ?? [86, 26, -24];
  const zoneSize = options.zoneSize ?? 60;
  const tolerance = options.surfaceTolerance ?? SURFACE_TOLERANCE;

  const structural = structuralCorrespondence(reference, candidate);
  const shared = [...reference.entities.keys()].filter((id) => candidate.entities.has(id));

  const placementRows = [];
  const surfaceRows = [];
  const relationalRows = [];
  const structureRows = [];

  for (const id of shared) {
    const left = reference.entities.get(id);
    const right = candidate.entities.get(id);

    const anchorError = distance(left.anchor, right.anchor);
    const extentError = Math.max(
      ...[0, 1, 2].map((axis) => Math.abs(left.extent[axis] - right.extent[axis])),
    );
    const extentRelative = Math.max(
      ...[0, 1, 2].map(
        (axis) => Math.abs(left.extent[axis] - right.extent[axis]) / Math.max(1e-6, left.extent[axis]),
      ),
    );
    const orientation = orientationError(left.orientation, right.orientation);
    placementRows.push({
      semanticId: id,
      kind: left.kind,
      anchorError,
      extentError,
      extentRelative,
      orientationType: orientation.type,
      orientationError: orientation.error ?? Number.POSITIVE_INFINITY,
    });

    const surface = surfaceDistance(left.samples, right.samples, tolerance);
    if (surface) {
      surfaceRows.push({
        semanticId: id,
        kind: left.kind,
        rmse: surface.symmetric.rmse,
        p95: surface.symmetric.p95,
        max: surface.symmetric.max,
        overToleranceFraction: surface.symmetric.overToleranceFraction,
        referenceToCandidateP95: surface.referenceToCandidate.p95,
        candidateToReferenceP95: surface.candidateToReference.p95,
      });
    }

    // Meaningful semantic structure: a bounds-accurate but single-blob
    // replacement of a multi-part authored object must be visible here.
    structureRows.push({
      semanticId: id,
      kind: left.kind,
      referenceComponents: left.componentCount,
      candidateComponents: right.componentCount,
      componentDelta: Math.abs(left.componentCount - right.componentCount),
      referenceTriangles: left.triangles,
      candidateTriangles: right.triangles,
    });
  }

  // Relational layout: pairwise distance and relative bearing inside each
  // entity's reference neighbourhood, so a globally shifted island and a
  // locally scrambled village fail differently.
  for (const id of shared) {
    const neighbours = neighbourhoodOf(reference.entities, id);
    const candidateOrigin = candidate.entities.get(id);
    let distanceError = 0;
    let bearingError = 0;
    let counted = 0;
    let bearingCounted = 0;
    for (const neighbour of neighbours) {
      const candidateNeighbour = candidate.entities.get(neighbour.semanticId);
      if (!candidateNeighbour) continue;
      distanceError = Math.max(
        distanceError,
        Math.abs(
          distance(candidateOrigin.anchor, candidateNeighbour.anchor) - neighbour.distance,
        ),
      );
      counted += 1;
      if (neighbour.horizontalDistance < MINIMUM_BEARING_SEPARATION) continue;
      bearingError = Math.max(
        bearingError,
        angleDelta(bearing(candidateOrigin.anchor, candidateNeighbour.anchor), neighbour.bearing),
      );
      bearingCounted += 1;
    }
    if (counted > 0) {
      relationalRows.push({
        semanticId: id,
        distanceError,
        bearingError: bearingCounted > 0 ? bearingError : Number.NaN,
        counted,
        bearingCounted,
      });
    }
  }

  const referenceZones = zoneOccupancy(reference.entities, sceneAnchor, zoneSize);
  const candidateZones = zoneOccupancy(candidate.entities, sceneAnchor, zoneSize);
  const zoneKeys = new Set([...referenceZones.keys(), ...candidateZones.keys()]);
  const zoneRows = [...zoneKeys].map((key) => ({
    zone: key,
    reference: referenceZones.get(key) ?? 0,
    candidate: candidateZones.get(key) ?? 0,
    delta: Math.abs((referenceZones.get(key) ?? 0) - (candidateZones.get(key) ?? 0)),
  }));

  // Overlap ordering from the authored overview: how far each entity moves in
  // the front-to-back ranking.
  const eye = options.overviewPosition ?? [390, 190, 410];
  const rank = (entities) =>
    new Map(
      [...entities.values()]
        .sort((a, b) => distance(eye, a.anchor) - distance(eye, b.anchor))
        .map((entity, index) => [entity.semanticId, index]),
    );
  const referenceRank = rank(reference.entities);
  const candidateRank = rank(candidate.entities);
  const rankErrors = shared
    .filter((id) => referenceRank.has(id) && candidateRank.has(id))
    .map((id) => Math.abs(referenceRank.get(id) - candidateRank.get(id)));

  const coverRows = [];
  const referenceCovers = [...reference.covers.values()];
  const candidateCovers = [...candidate.covers.values()];
  for (const referenceCover of referenceCovers) {
    const match = candidateCovers.find((cover) => cover.count === referenceCover.count);
    coverRows.push({
      count: referenceCover.count,
      matched: Boolean(match),
      referenceRegion: referenceCover.bounds,
      candidateRegion: match?.bounds ?? null,
      regionCentreError: match
        ? horizontalDistance(
            [
              (referenceCover.bounds.min[0] + referenceCover.bounds.max[0]) / 2,
              0,
              (referenceCover.bounds.min[2] + referenceCover.bounds.max[2]) / 2,
            ],
            [
              (match.bounds.min[0] + match.bounds.max[0]) / 2,
              0,
              (match.bounds.min[2] + match.bounds.max[2]) / 2,
            ],
          )
        : null,
      densityRatio: match
        ? Number(
            (
              referenceCover.count /
              Math.max(
                1e-6,
                (referenceCover.bounds.max[0] - referenceCover.bounds.min[0]) *
                  (referenceCover.bounds.max[2] - referenceCover.bounds.min[2]),
              ) /
              (match.count /
                Math.max(
                  1e-6,
                  (match.bounds.max[0] - match.bounds.min[0]) *
                    (match.bounds.max[2] - match.bounds.min[2]),
                ))
            ).toFixed(4),
          )
        : null,
    });
  }

  return {
    schemaVersion: CORRESPONDENCE_SCHEMA,
    adapterIntegrity: {
      reference: reference.adapterIntegrity,
      candidate: candidate.adapterIntegrity,
      passed: candidate.adapterIntegrity.transientCorrection === false,
    },
    structural,
    placement: {
      anchorError: statistics(placementRows.map((row) => row.anchorError)),
      extentError: statistics(placementRows.map((row) => row.extentError)),
      extentRelative: statistics(placementRows.map((row) => row.extentRelative)),
      orientationError: statistics(
        placementRows
          .filter((row) => Number.isFinite(row.orientationError))
          .map((row) => row.orientationError),
      ),
      orientationTypeMismatch: placementRows.filter((row) => row.orientationType === "mismatch")
        .length,
      worstAnchor: worst(placementRows, "anchorError"),
      worstExtent: worst(placementRows, "extentRelative"),
      worstOrientation: worst(placementRows, "orientationError"),
    },
    relational: {
      distanceError: statistics(relationalRows.map((row) => row.distanceError)),
      bearingError: statistics(
        relationalRows.filter((row) => row.bearingCounted > 0).map((row) => row.bearingError),
      ),
      bearingSeparation: MINIMUM_BEARING_SEPARATION,
      worstDistance: worst(relationalRows, "distanceError"),
      worstBearing: worst(relationalRows, "bearingError"),
    },
    zones: {
      size: zoneSize,
      occupied: zoneRows.length,
      delta: statistics(zoneRows.map((row) => row.delta)),
      worst: [...zoneRows].sort((a, b) => b.delta - a.delta).slice(0, 8),
    },
    overlapOrdering: {
      rankError: statistics(rankErrors),
    },
    surface: {
      tolerance,
      rmse: statistics(surfaceRows.map((row) => row.rmse)),
      p95: statistics(surfaceRows.map((row) => row.p95)),
      max: statistics(surfaceRows.map((row) => row.max)),
      overToleranceFraction: statistics(
        surfaceRows.map((row) => row.overToleranceFraction),
      ),
      worstRmse: worst(surfaceRows, "rmse"),
      worstP95: worst(surfaceRows, "p95"),
      byKind: summarizeByKind(surfaceRows, "p95"),
    },
    semanticStructure: {
      componentDelta: statistics(structureRows.map((row) => row.componentDelta)),
      entitiesMissingComponents: structureRows.filter(
        (row) => row.candidateComponents < row.referenceComponents,
      ).length,
      worstComponentDelta: worst(structureRows, "componentDelta"),
    },
    distributedCover: {
      referenceCovers: referenceCovers.length,
      candidateCovers: candidateCovers.length,
      unmatched: coverRows.filter((row) => !row.matched).length,
      rows: coverRows,
    },
  };
}

function summarizeByKind(rows, key) {
  const kinds = new Map();
  for (const row of rows) {
    const values = kinds.get(row.kind) ?? [];
    values.push(row[key]);
    kinds.set(row.kind, values);
  }
  return Object.fromEntries(
    [...kinds.entries()]
      .map(([kind, values]) => [kind, statistics(values)])
      .sort((a, b) => b[1].mean - a[1].mean),
  );
}
