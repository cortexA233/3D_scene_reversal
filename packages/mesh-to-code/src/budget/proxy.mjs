import { createMesh, meshBounds } from "../geometry/mesh.mjs";

/**
 * The Budget Proxy: the Authored Reference rebuilt at the unit's declared
 * compactness budget.
 *
 * Five of the eight Stage 2 units needed a human-anchored baseline because
 * reference-side separability does not imply candidate reachability — a human
 * exemplar was supplying an estimate of how well any compact procedural program
 * could score. The proxy replaces that estimate with a construct computed from
 * the reference alone, so the reachability bound can be frozen before any
 * candidate is fitted.
 *
 * Construction is deterministic vertex-cluster decimation: cluster vertices into
 * a cubic lattice, collapse each cell to its member centroid, drop triangles
 * whose corners collapsed together. The lattice resolution is chosen by bisection
 * as the finest that still meets the triangle budget. Nothing resolution-dependent
 * is retained: the proxy mesh is scored and discarded, and only its per-metric
 * scores are published.
 *
 * The bound is honest in the right direction. The proxy *is* the reference, just
 * coarsened to the budget, so no compact procedural program at that budget should
 * beat it by much — which is what makes it an upper bound on reachability rather
 * than a target.
 */

const MAXIMUM_BISECTION_STEPS = 24;
const MINIMUM_LATTICE = 2;
const MAXIMUM_LATTICE = 512;

function decimateAtLattice({ positions, indices, bounds, lattice }) {
  const longest = Math.max(...bounds.size) || 1;
  const cell = longest / lattice;
  const keyOf = (offset) =>
    `${Math.floor((positions[offset] - bounds.min[0]) / cell)}:` +
    `${Math.floor((positions[offset + 1] - bounds.min[1]) / cell)}:` +
    `${Math.floor((positions[offset + 2] - bounds.min[2]) / cell)}`;

  // Insertion order is the vertex order, which is deterministic, so cluster
  // indices do not depend on hash iteration order.
  const clusterIndexByKey = new Map();
  const sums = [];
  const counts = [];
  const vertexCluster = new Uint32Array(positions.length / 3);
  for (let vertex = 0; vertex < vertexCluster.length; vertex += 1) {
    const offset = vertex * 3;
    const key = keyOf(offset);
    let cluster = clusterIndexByKey.get(key);
    if (cluster === undefined) {
      cluster = sums.length / 3;
      clusterIndexByKey.set(key, cluster);
      sums.push(0, 0, 0);
      counts.push(0);
    }
    sums[cluster * 3] += positions[offset];
    sums[cluster * 3 + 1] += positions[offset + 1];
    sums[cluster * 3 + 2] += positions[offset + 2];
    counts[cluster] += 1;
    vertexCluster[vertex] = cluster;
  }

  const clusterPositions = new Float64Array(sums.length);
  for (let cluster = 0; cluster < counts.length; cluster += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      clusterPositions[cluster * 3 + axis] = sums[cluster * 3 + axis] / counts[cluster];
    }
  }

  const kept = [];
  for (let face = 0; face < indices.length; face += 3) {
    const a = vertexCluster[indices[face]];
    const b = vertexCluster[indices[face + 1]];
    const c = vertexCluster[indices[face + 2]];
    if (a === b || b === c || c === a) continue;
    kept.push(a, b, c);
  }
  return { clusterPositions, indices: kept };
}

/**
 * @param {object} input
 * @param {object} input.mesh the Authored Reference, in any consistent space
 * @param {number} input.triangleBudget from the Complexity Budget Formula
 * @param {Array<{roleId: string, color: [number, number, number]}>} [input.materialRoles]
 */
export function buildBudgetProxy({ mesh, triangleBudget, materialRoles = null }) {
  if (!Number.isInteger(triangleBudget) || triangleBudget < 4) {
    throw new RangeError("triangleBudget must be an integer of at least four");
  }
  const bounds = meshBounds(mesh);

  // When the budget already holds the whole reference, the proxy is the
  // reference. Decimating anyway would push the bound below what is reachable,
  // and a reachability bound has to err upward or it stops being a bound. This
  // case is reported rather than hidden: it says the compactness budget is not
  // what limits geometric fidelity for this unit.
  if (mesh.triangleCount <= triangleBudget) {
    return {
      constructed: true,
      budgetIsBinding: false,
      triangleBudget,
      lattice: null,
      bisectionSteps: 0,
      mesh,
      triangleCount: mesh.triangleCount,
      vertexCount: mesh.vertexCount,
      budgetUtilization: mesh.triangleCount / triangleBudget,
      construction: {
        method: "the Authored Reference unchanged, because the triangle budget already holds it",
        latticeSelection: "not applicable",
        retains: "nothing; the proxy mesh is scored and discarded",
      },
      materialRoles:
        materialRoles === null
          ? [{ roleId: "role-0", color: null, note: "the input declared no material role" }]
          : materialRoles,
      materialRoleNote:
        "flat per-role colours substitute for the source texture; L1 does not score colour, so no appearance reachability is claimed here",
    };
  }

  let low = MINIMUM_LATTICE;
  let high = MAXIMUM_LATTICE;
  let best = null;
  let steps = 0;
  while (low <= high && steps < MAXIMUM_BISECTION_STEPS) {
    steps += 1;
    const lattice = Math.floor((low + high) / 2);
    const attempt = decimateAtLattice({
      positions: mesh.positions,
      indices: mesh.indices,
      bounds,
      lattice,
    });
    const triangleCount = attempt.indices.length / 3;
    if (triangleCount <= triangleBudget) {
      if (best === null || triangleCount > best.triangleCount) {
        best = { lattice, triangleCount, ...attempt };
      }
      low = lattice + 1;
    } else {
      high = lattice - 1;
    }
  }

  if (best === null || best.triangleCount < 4) {
    // Even the coarsest lattice overshoots, or collapses the mesh entirely.
    return {
      constructed: false,
      reason:
        best === null
          ? "no lattice resolution meets the triangle budget"
          : "decimation at the budget collapses the mesh below four triangles",
      triangleBudget,
      bisectionSteps: steps,
    };
  }

  const proxyMesh = createMesh({
    positions: best.clusterPositions,
    indices: best.indices,
    name: "budget-proxy",
  });

  return {
    constructed: true,
    budgetIsBinding: true,
    triangleBudget,
    lattice: best.lattice,
    bisectionSteps: steps,
    mesh: proxyMesh,
    triangleCount: proxyMesh.triangleCount,
    vertexCount: proxyMesh.vertexCount,
    budgetUtilization: proxyMesh.triangleCount / triangleBudget,
    construction: {
      method: "deterministic vertex-cluster decimation of the Authored Reference",
      latticeSelection:
        "bisection for the finest cubic lattice whose output still meets the triangle budget",
      retains: "nothing; the proxy mesh is scored and discarded",
    },
    /**
     * Automatically clustered role colours stand in for the source texture. The
     * L1 stack scores geometry only — a Bounded Semantic Pattern Program executes
     * as a shader and cannot descend to it — so these are recorded as part of the
     * construction and are deliberately absent from the reachability bound.
     */
    materialRoles:
      materialRoles === null
        ? [{ roleId: "role-0", color: null, note: "the input declared no material role" }]
        : materialRoles,
    materialRoleNote:
      "flat per-role colours substitute for the source texture; L1 does not score colour, so no appearance reachability is claimed here",
  };
}
