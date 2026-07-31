const DEFAULT_RELATIVE_WELD_TOLERANCE = 1e-6;
const MINIMUM_WELD_TOLERANCE = 1e-9;

function requireFiniteNumber(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
}

function edgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function createUnionFind(size) {
  const parents = Array.from({ length: size }, (_, index) => index);
  const ranks = new Uint8Array(size);

  function find(value) {
    let root = value;
    while (parents[root] !== root) root = parents[root];
    while (parents[value] !== value) {
      const parent = parents[value];
      parents[value] = root;
      value = parent;
    }
    return root;
  }

  function union(a, b) {
    let rootA = find(a);
    let rootB = find(b);
    if (rootA === rootB) return;
    if (ranks[rootA] < ranks[rootB]) [rootA, rootB] = [rootB, rootA];
    parents[rootB] = rootA;
    if (ranks[rootA] === ranks[rootB]) ranks[rootA] += 1;
  }

  return { find, union };
}

function findBounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index + axis];
      requireFiniteNumber(value, `positions[${index + axis}]`);
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  const size = max.map((value, axis) => value - min[axis]);
  return { min, max, size };
}

function weldPositions(positions, tolerance) {
  const cells = new Map();
  const welded = [];
  const rawToWelded = new Uint32Array(positions.length / 3);
  const toleranceSquared = tolerance * tolerance;

  function cellKey(x, y, z) {
    return `${x}:${y}:${z}`;
  }

  for (let rawIndex = 0; rawIndex < positions.length / 3; rawIndex += 1) {
    const offset = rawIndex * 3;
    const x = positions[offset];
    const y = positions[offset + 1];
    const z = positions[offset + 2];
    const cell = [
      Math.floor(x / tolerance),
      Math.floor(y / tolerance),
      Math.floor(z / tolerance),
    ];
    let match = -1;

    for (let dx = -1; dx <= 1 && match === -1; dx += 1) {
      for (let dy = -1; dy <= 1 && match === -1; dy += 1) {
        for (let dz = -1; dz <= 1 && match === -1; dz += 1) {
          const candidates = cells.get(
            cellKey(cell[0] + dx, cell[1] + dy, cell[2] + dz),
          );
          if (!candidates) continue;
          for (const candidate of candidates) {
            const point = welded[candidate];
            const distanceSquared =
              (x - point[0]) ** 2 +
              (y - point[1]) ** 2 +
              (z - point[2]) ** 2;
            if (distanceSquared <= toleranceSquared) {
              match = candidate;
              break;
            }
          }
        }
      }
    }

    if (match === -1) {
      match = welded.length;
      welded.push([x, y, z]);
      const key = cellKey(...cell);
      const candidates = cells.get(key) ?? [];
      candidates.push(match);
      cells.set(key, candidates);
    }
    rawToWelded[rawIndex] = match;
  }

  return { welded, rawToWelded };
}

/**
 * Analyze an indexed or non-indexed triangle mesh without retaining source data.
 *
 * @param {object} input
 * @param {ArrayLike<number>} input.positions flat xyz array
 * @param {ArrayLike<number> | null} [input.indices]
 * @param {number} [input.weldTolerance]
 */
export function analyzeTriangleMesh({
  positions: positionInput,
  indices: indexInput = null,
  weldTolerance,
}) {
  const positions = Array.from(positionInput);
  if (positions.length === 0 || positions.length % 3 !== 0) {
    throw new RangeError("positions must contain one or more xyz triples");
  }

  const indices = indexInput
    ? Array.from(indexInput)
    : Array.from({ length: positions.length / 3 }, (_, index) => index);
  if (indices.length === 0 || indices.length % 3 !== 0) {
    throw new RangeError("triangle indices must be a non-empty multiple of three");
  }
  for (let index = 0; index < indices.length; index += 1) {
    const value = indices[index];
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value >= positions.length / 3
    ) {
      throw new RangeError(`indices[${index}] is outside the position array`);
    }
  }

  const bounds = findBounds(positions);
  const largestDimension = Math.max(...bounds.size);
  const tolerance =
    weldTolerance ??
    Math.max(largestDimension * DEFAULT_RELATIVE_WELD_TOLERANCE, MINIMUM_WELD_TOLERANCE);
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new RangeError("weldTolerance must be greater than zero");
  }

  const { welded, rawToWelded } = weldPositions(positions, tolerance);
  const unionFind = createUnionFind(welded.length);
  const faces = [];
  const edgeCounts = new Map();
  const referencedVertices = new Set();
  let surfaceArea = 0;
  let degenerateTriangleCount = 0;

  for (let faceIndex = 0; faceIndex < indices.length; faceIndex += 3) {
    const raw = [indices[faceIndex], indices[faceIndex + 1], indices[faceIndex + 2]];
    const weldedFace = raw.map((index) => rawToWelded[index]);
    const [a, b, c] = weldedFace;
    if (a === b || b === c || c === a) {
      degenerateTriangleCount += 1;
      continue;
    }

    unionFind.union(a, b);
    unionFind.union(b, c);
    referencedVertices.add(a);
    referencedVertices.add(b);
    referencedVertices.add(c);
    for (const [start, end] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = edgeKey(start, end);
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }

    const pa = raw.map((index) => [
      positions[index * 3],
      positions[index * 3 + 1],
      positions[index * 3 + 2],
    ]);
    const ab = [pa[1][0] - pa[0][0], pa[1][1] - pa[0][1], pa[1][2] - pa[0][2]];
    const ac = [pa[2][0] - pa[0][0], pa[2][1] - pa[0][1], pa[2][2] - pa[0][2]];
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    surfaceArea += Math.hypot(...cross) * 0.5;
    const signedVolume =
      (pa[0][0] * (pa[1][1] * pa[2][2] - pa[1][2] * pa[2][1]) -
        pa[0][1] * (pa[1][0] * pa[2][2] - pa[1][2] * pa[2][0]) +
        pa[0][2] * (pa[1][0] * pa[2][1] - pa[1][1] * pa[2][0])) /
      6;
    faces.push({ weldedFace, signedVolume });
  }

  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  for (const count of edgeCounts.values()) {
    if (count === 1) boundaryEdgeCount += 1;
    if (count > 2) nonManifoldEdgeCount += 1;
  }

  const componentRoots = new Set(
    Array.from(referencedVertices, (vertex) => unionFind.find(vertex)),
  );
  const isClosed =
    faces.length > 0 &&
    degenerateTriangleCount === 0 &&
    boundaryEdgeCount === 0 &&
    nonManifoldEdgeCount === 0;

  let volume = null;
  let volumeUnavailableReason = null;
  if (isClosed) {
    const volumesByComponent = new Map();
    for (const face of faces) {
      const root = unionFind.find(face.weldedFace[0]);
      volumesByComponent.set(
        root,
        (volumesByComponent.get(root) ?? 0) + face.signedVolume,
      );
    }
    volume = Array.from(volumesByComponent.values()).reduce(
      (sum, componentVolume) => sum + Math.abs(componentVolume),
      0,
    );
  } else if (degenerateTriangleCount > 0) {
    volumeUnavailableReason = "degenerate-triangles";
  } else if (nonManifoldEdgeCount > 0) {
    volumeUnavailableReason = "non-manifold-edges";
  } else {
    volumeUnavailableReason = "open-boundary";
  }

  return {
    sourceVertexCount: positions.length / 3,
    weldedVertexCount: welded.length,
    triangleCount: indices.length / 3,
    analyzedTriangleCount: faces.length,
    degenerateTriangleCount,
    connectedComponentCount: componentRoots.size,
    boundaryEdgeCount,
    nonManifoldEdgeCount,
    isClosed,
    surfaceArea,
    volume,
    volumeUnavailableReason,
    weldTolerance: tolerance,
    bounds,
  };
}
