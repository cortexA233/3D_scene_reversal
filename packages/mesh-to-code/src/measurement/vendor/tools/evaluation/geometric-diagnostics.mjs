import { analyzeTriangleMesh } from "../ground-truth/mesh-analysis.mjs";

function positionsAsPoints(positions) {
  if (!positions || positions.length === 0 || positions.length % 3 !== 0) {
    throw new RangeError("positions must contain one or more xyz triples");
  }
  return Array.from({ length: positions.length / 3 }, (_, index) => [
    positions[index * 3],
    positions[index * 3 + 1],
    positions[index * 3 + 2],
  ]);
}

function nearestDistances(source, target) {
  return source.map((point) => {
    let nearestSquared = Infinity;
    for (const candidate of target) {
      const squared =
        (point[0] - candidate[0]) ** 2 +
        (point[1] - candidate[1]) ** 2 +
        (point[2] - candidate[2]) ** 2;
      nearestSquared = Math.min(nearestSquared, squared);
    }
    return Math.sqrt(nearestSquared);
  });
}

export function comparePointSets(referencePositions, replacementPositions) {
  const reference = positionsAsPoints(referencePositions);
  const replacement = positionsAsPoints(replacementPositions);
  const distances = [
    ...nearestDistances(reference, replacement),
    ...nearestDistances(replacement, reference),
  ];
  return {
    sampling: "position-attribute-vertices-with-duplicates-retained",
    referencePointCount: reference.length,
    replacementPointCount: replacement.length,
    symmetricChamferMeanCanonical:
      distances.reduce((sum, value) => sum + value, 0) / distances.length,
    symmetricHausdorffCanonical: Math.max(...distances),
  };
}

function relativeError(reference, replacement) {
  if (!Number.isFinite(reference) || !Number.isFinite(replacement)) return null;
  if (Math.abs(reference) < 1e-12) return Math.abs(replacement - reference);
  return Math.abs(replacement - reference) / Math.abs(reference);
}

export function evaluateGeometricDiagnostics({
  referencePositions,
  referenceIndices = null,
  replacementPositions,
  replacementIndices = null,
}) {
  const reference = analyzeTriangleMesh({
    positions: referencePositions,
    indices: referenceIndices,
  });
  const replacement = analyzeTriangleMesh({
    positions: replacementPositions,
    indices: replacementIndices,
  });
  return {
    units: "canonical",
    surfaceArea: {
      reference: reference.surfaceArea,
      replacement: replacement.surfaceArea,
      relativeError: relativeError(reference.surfaceArea, replacement.surfaceArea),
    },
    volume: {
      reference: reference.volume,
      replacement: replacement.volume,
      relativeError: relativeError(reference.volume, replacement.volume),
      referenceUnavailableReason: reference.volumeUnavailableReason,
      replacementUnavailableReason: replacement.volumeUnavailableReason,
    },
    topology: {
      referenceConnectedComponents: reference.connectedComponentCount,
      replacementConnectedComponents: replacement.connectedComponentCount,
      referenceClosed: reference.isClosed,
      replacementClosed: replacement.isClosed,
    },
    pointSetDistance: comparePointSets(
      referencePositions,
      replacementPositions,
    ),
  };
}
