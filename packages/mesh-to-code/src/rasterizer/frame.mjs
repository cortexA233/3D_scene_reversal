/**
 * Bake geometry into the canonical evaluation space the harness renders in.
 *
 * The harness wraps each root in a frame: the root carries
 * `translationBeforeScale` as its position and the frame carries a uniform
 * scale, so a vertex maps to `uniformScale * (p + translationBeforeScale)`.
 * Normals go through `mat3(modelMatrix) * normal` followed by a normalize, and a
 * uniform scale cancels under that normalize — so normals are carried through
 * unchanged rather than being pushed through an inverse-transpose. That is what
 * the harness's shader does, and reproducing it exactly matters more than being
 * textbook-correct about non-uniform scales that this framing never produces.
 */
export function bakeToEvaluationSpace({ positions, normals = null, indices, transform }) {
  const { translationBeforeScale, uniformScale } = transform;
  const baked = new Float64Array(positions.length);
  for (let offset = 0; offset < positions.length; offset += 3) {
    baked[offset] = (positions[offset] + translationBeforeScale[0]) * uniformScale;
    baked[offset + 1] = (positions[offset + 1] + translationBeforeScale[1]) * uniformScale;
    baked[offset + 2] = (positions[offset + 2] + translationBeforeScale[2]) * uniformScale;
  }
  return {
    positions: baked,
    normals: normals === null ? null : Float64Array.from(normals),
    indices: Uint32Array.from(indices),
  };
}

/**
 * Area-weighted vertex normals, used only when a source carries none. Three.js's
 * `computeVertexNormals` accumulates the un-normalized cross product per face,
 * which is area-weighted, then normalizes — so this matches what the browser
 * would have computed for the same buffer.
 */
export function computeVertexNormals({ positions, indices }) {
  const normals = new Float64Array(positions.length);
  for (let face = 0; face < indices.length; face += 3) {
    const a = indices[face] * 3;
    const b = indices[face + 1] * 3;
    const c = indices[face + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const corner of [a, b, c]) {
      normals[corner] += nx;
      normals[corner + 1] += ny;
      normals[corner + 2] += nz;
    }
  }
  for (let offset = 0; offset < normals.length; offset += 3) {
    const lengthSquared =
      normals[offset] * normals[offset] +
      normals[offset + 1] * normals[offset + 1] +
      normals[offset + 2] * normals[offset + 2];
    if (lengthSquared === 0) continue;
    const inverse = 1 / Math.sqrt(lengthSquared);
    normals[offset] *= inverse;
    normals[offset + 1] *= inverse;
    normals[offset + 2] *= inverse;
  }
  return normals;
}

/** Concatenate render parts into one draw list, as the harness's single scene does. */
export function mergeParts(parts) {
  let vertexCount = 0;
  let indexCount = 0;
  for (const part of parts) {
    vertexCount += part.positions.length / 3;
    indexCount += part.indices.length;
  }
  const positions = new Float64Array(vertexCount * 3);
  const normals = new Float64Array(vertexCount * 3);
  const indices = new Uint32Array(indexCount);
  let positionCursor = 0;
  let indexCursor = 0;
  let vertexOffset = 0;
  for (const part of parts) {
    positions.set(part.positions, positionCursor);
    const partNormals =
      part.normals ??
      computeVertexNormals({ positions: part.positions, indices: part.indices });
    normals.set(partNormals, positionCursor);
    for (let index = 0; index < part.indices.length; index += 1) {
      indices[indexCursor + index] = part.indices[index] + vertexOffset;
    }
    positionCursor += part.positions.length;
    indexCursor += part.indices.length;
    vertexOffset += part.positions.length / 3;
  }
  return { positions, normals, indices };
}
