import { createMesh, meshBounds, meshSurfaceArea } from "../geometry/mesh.mjs";

const RELATIVE_WELD_TOLERANCE = 1e-6;
const MINIMUM_WELD_TOLERANCE = 1e-9;

function createUnionFind(size) {
  const parents = Array.from({ length: size }, (_, index) => index);
  const find = (value) => {
    let root = value;
    while (parents[root] !== root) root = parents[root];
    while (parents[value] !== value) {
      const parent = parents[value];
      parents[value] = root;
      value = parent;
    }
    return root;
  };
  return {
    find,
    union(a, b) {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parents[rootB] = rootA;
    },
  };
}

function weldVertices(mesh, tolerance) {
  const cells = new Map();
  const representatives = [];
  const rawToWelded = new Uint32Array(mesh.vertexCount);
  const toleranceSquared = tolerance * tolerance;

  for (let raw = 0; raw < mesh.vertexCount; raw += 1) {
    const x = mesh.positions[raw * 3];
    const y = mesh.positions[raw * 3 + 1];
    const z = mesh.positions[raw * 3 + 2];
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
            `${cell[0] + dx}:${cell[1] + dy}:${cell[2] + dz}`,
          );
          if (!candidates) continue;
          for (const candidate of candidates) {
            const point = representatives[candidate];
            if (
              (x - point[0]) ** 2 + (y - point[1]) ** 2 + (z - point[2]) ** 2 <=
              toleranceSquared
            ) {
              match = candidate;
              break;
            }
          }
        }
      }
    }
    if (match === -1) {
      match = representatives.length;
      representatives.push([x, y, z]);
      const key = `${cell[0]}:${cell[1]}:${cell[2]}`;
      const bucket = cells.get(key) ?? [];
      bucket.push(match);
      cells.set(key, bucket);
    }
    rawToWelded[raw] = match;
  }

  return { weldedCount: representatives.length, rawToWelded };
}

/**
 * Split a mesh into welded connected components. This is a mechanical,
 * recomputable candidate grouping — it never decides the semantic grouping.
 */
export function weldedConnectedComponents(mesh) {
  const bounds = meshBounds(mesh);
  const tolerance = Math.max(
    Math.max(...bounds.size) * RELATIVE_WELD_TOLERANCE,
    MINIMUM_WELD_TOLERANCE,
  );
  const { weldedCount, rawToWelded } = weldVertices(mesh, tolerance);
  const unionFind = createUnionFind(weldedCount);
  for (let face = 0; face < mesh.indices.length; face += 3) {
    const a = rawToWelded[mesh.indices[face]];
    const b = rawToWelded[mesh.indices[face + 1]];
    const c = rawToWelded[mesh.indices[face + 2]];
    unionFind.union(a, b);
    unionFind.union(b, c);
  }

  const facesByRoot = new Map();
  for (let face = 0; face < mesh.indices.length; face += 3) {
    const root = unionFind.find(rawToWelded[mesh.indices[face]]);
    const bucket = facesByRoot.get(root) ?? [];
    bucket.push(face);
    facesByRoot.set(root, bucket);
  }

  // Order components by descending triangle count then by minimum corner, so
  // component indices are stable across runs and platforms.
  const groups = [...facesByRoot.entries()].map(([root, faces]) => {
    const remap = new Map();
    const positions = [];
    const indices = [];
    for (const face of faces) {
      for (let corner = 0; corner < 3; corner += 1) {
        const raw = mesh.indices[face + corner];
        let local = remap.get(raw);
        if (local === undefined) {
          local = positions.length / 3;
          remap.set(raw, local);
          positions.push(
            mesh.positions[raw * 3],
            mesh.positions[raw * 3 + 1],
            mesh.positions[raw * 3 + 2],
          );
        }
        indices.push(local);
      }
    }
    const componentMesh = createMesh({ positions, indices });
    return { root, mesh: componentMesh, bounds: meshBounds(componentMesh) };
  });

  groups.sort(
    (a, b) =>
      b.mesh.triangleCount - a.mesh.triangleCount ||
      a.bounds.min[0] - b.bounds.min[0] ||
      a.bounds.min[1] - b.bounds.min[1] ||
      a.bounds.min[2] - b.bounds.min[2],
  );

  return {
    weldTolerance: tolerance,
    weldedVertexCount: weldedCount,
    components: groups.map(({ mesh: componentMesh, bounds: componentBounds }, index) => ({
      componentIndex: index,
      mesh: componentMesh,
      bounds: componentBounds,
    })),
  };
}

function boundsGap(a, b) {
  return Math.max(
    ...[0, 1, 2].map((axis) =>
      Math.max(a.min[axis] - b.max[axis], b.min[axis] - a.max[axis], 0),
    ),
  );
}

/**
 * Mechanical evidence for the unit-division and semantic-grouping Decision
 * Points. Every field is numeric; nothing here selects a grouping.
 */
export function mechanicalEvidence(mesh) {
  const overall = meshBounds(mesh);
  const largestDimension = Math.max(...overall.size);
  const { components, weldTolerance, weldedVertexCount } =
    weldedConnectedComponents(mesh);

  const componentRecords = components.map((component) => {
    const size = component.bounds.size;
    const centroid = [0, 1, 2].map(
      (axis) => (component.bounds.min[axis] + component.bounds.max[axis]) * 0.5,
    );
    const componentLargest = Math.max(...size);
    return {
      componentIndex: component.componentIndex,
      triangleCount: component.mesh.triangleCount,
      vertexCount: component.mesh.vertexCount,
      bounds: {
        min: component.bounds.min,
        max: component.bounds.max,
        size,
      },
      centroid,
      surfaceArea: meshSurfaceArea(component.mesh),
      relativeScale: largestDimension > 0 ? componentLargest / largestDimension : 0,
      aspectRatio: componentLargest > 0 ? Math.min(...size) / componentLargest : 0,
    };
  });

  const gaps = [];
  for (let a = 0; a < components.length; a += 1) {
    for (let b = a + 1; b < components.length; b += 1) {
      gaps.push({
        components: [a, b],
        gap: boundsGap(components[a].bounds, components[b].bounds),
      });
    }
  }
  const minimumGap = gaps.length === 0 ? 0 : Math.min(...gaps.map((entry) => entry.gap));

  // Shape-descriptor clustering on the normalized (size, aspect) descriptor.
  // Recomputable and deliberately crude: it proposes, it never decides.
  const descriptorClusters = new Map();
  for (const record of componentRecords) {
    const key = `${quantize(record.relativeScale)}:${quantize(record.aspectRatio)}`;
    const bucket = descriptorClusters.get(key) ?? [];
    bucket.push(record.componentIndex);
    descriptorClusters.set(key, bucket);
  }

  return {
    overallBounds: { min: overall.min, max: overall.max, size: overall.size },
    largestDimension,
    triangleCount: mesh.triangleCount,
    weldTolerance,
    weldedVertexCount,
    componentCount: components.length,
    components: componentRecords,
    pairwiseBoundsGaps: gaps,
    separationRatio: largestDimension > 0 ? minimumGap / largestDimension : 0,
    shapeDescriptorClusters: [...descriptorClusters.entries()]
      .map(([descriptor, members]) => ({ descriptor, components: members }))
      .sort((a, b) => a.descriptor.localeCompare(b.descriptor)),
    repetitionTrackCount: [...descriptorClusters.values()].filter(
      (members) => members.length > 1,
    ).length,
  };
}

function quantize(value) {
  return Math.round(value * 20) / 20;
}

export function componentMeshes(mesh) {
  return weldedConnectedComponents(mesh).components.map((component) => component.mesh);
}
