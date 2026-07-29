import assert from "node:assert/strict";
import test from "node:test";

import { analyzeTriangleMesh } from "../tools/ground-truth/mesh-analysis.mjs";

const TETRAHEDRON_POSITIONS = [
  0, 0, 0,
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
];
const TETRAHEDRON_INDICES = [
  0, 2, 1,
  0, 1, 3,
  0, 3, 2,
  1, 2, 3,
];

test("closed tetrahedron reports one component, area, and valid volume", () => {
  const result = analyzeTriangleMesh({
    positions: TETRAHEDRON_POSITIONS,
    indices: TETRAHEDRON_INDICES,
  });
  assert.equal(result.connectedComponentCount, 1);
  assert.equal(result.boundaryEdgeCount, 0);
  assert.equal(result.nonManifoldEdgeCount, 0);
  assert.equal(result.isClosed, true);
  assert.ok(Math.abs(result.volume - 1 / 6) < 1e-12);
  assert.ok(Math.abs(result.surfaceArea - (1.5 + Math.sqrt(3) / 2)) < 1e-12);
  assert.equal(result.volumeUnavailableReason, null);
});

test("open indexed quad reports its four boundary edges and no volume", () => {
  const result = analyzeTriangleMesh({
    positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
    indices: [0, 1, 2, 0, 2, 3],
  });
  assert.equal(result.connectedComponentCount, 1);
  assert.equal(result.boundaryEdgeCount, 4);
  assert.equal(result.nonManifoldEdgeCount, 0);
  assert.equal(result.isClosed, false);
  assert.equal(result.volume, null);
  assert.equal(result.volumeUnavailableReason, "open-boundary");
  assert.equal(result.surfaceArea, 1);
});

test("duplicate source vertices weld into one connected open surface", () => {
  const result = analyzeTriangleMesh({
    positions: [
      0, 0, 0, 1, 0, 0, 1, 1, 0,
      0, 0, 0, 1, 1, 0, 0, 1, 0,
    ],
  });
  assert.equal(result.sourceVertexCount, 6);
  assert.equal(result.weldedVertexCount, 4);
  assert.equal(result.connectedComponentCount, 1);
  assert.equal(result.boundaryEdgeCount, 4);
});

test("two separated triangles report two components", () => {
  const result = analyzeTriangleMesh({
    positions: [
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      3, 0, 0, 4, 0, 0, 3, 1, 0,
    ],
  });
  assert.equal(result.connectedComponentCount, 2);
  assert.equal(result.boundaryEdgeCount, 6);
  assert.equal(result.isClosed, false);
});

test("three faces sharing an edge report non-manifold topology", () => {
  const result = analyzeTriangleMesh({
    positions: [
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      0, -1, 0,
      0, 0, 1,
    ],
    indices: [0, 1, 2, 1, 0, 3, 0, 1, 4],
  });
  assert.equal(result.connectedComponentCount, 1);
  assert.equal(result.nonManifoldEdgeCount, 1);
  assert.equal(result.isClosed, false);
  assert.equal(result.volume, null);
  assert.equal(result.volumeUnavailableReason, "non-manifold-edges");
});

test("malformed positions and indices fail explicitly", () => {
  assert.throws(
    () => analyzeTriangleMesh({ positions: [0, 0] }),
    /xyz triples/,
  );
  assert.throws(
    () => analyzeTriangleMesh({ positions: [0, 0, 0], indices: [0, 1, 2] }),
    /outside the position array/,
  );
  assert.throws(
    () =>
      analyzeTriangleMesh({
        positions: [0, 0, 0, 1, 0, 0, Number.NaN, 1, 0],
      }),
    /must be finite/,
  );
});
