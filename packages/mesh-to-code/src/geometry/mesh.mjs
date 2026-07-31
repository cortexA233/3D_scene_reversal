/**
 * The kernel's internal triangle mesh: a flat position array plus triangle
 * indices, with no renderer, no material, and no file-format residue.
 */

export function createMesh({ positions, indices = null, name = null }) {
  const positionArray =
    positions instanceof Float64Array ? positions : Float64Array.from(positions);
  if (positionArray.length === 0 || positionArray.length % 3 !== 0) {
    throw new RangeError("positions must contain one or more xyz triples");
  }
  for (let index = 0; index < positionArray.length; index += 1) {
    if (!Number.isFinite(positionArray[index])) {
      throw new RangeError(`positions[${index}] must be finite`);
    }
  }
  const vertexCount = positionArray.length / 3;
  const indexArray =
    indices === null
      ? Uint32Array.from({ length: vertexCount }, (_, index) => index)
      : Uint32Array.from(indices);
  if (indexArray.length === 0 || indexArray.length % 3 !== 0) {
    throw new RangeError("triangle indices must be a non-empty multiple of three");
  }
  for (let index = 0; index < indexArray.length; index += 1) {
    if (indexArray[index] >= vertexCount) {
      throw new RangeError(`indices[${index}] is outside the position array`);
    }
  }
  return Object.freeze({
    name,
    positions: positionArray,
    indices: indexArray,
    vertexCount,
    triangleCount: indexArray.length / 3,
  });
}

export function meshBounds(mesh) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < mesh.positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = mesh.positions[offset + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  return {
    min,
    max,
    size: max.map((value, axis) => value - min[axis]),
  };
}

/**
 * Move a mesh into its Reconstruction Frame: source-world axis orientation is
 * preserved and the world-space bounding-box bottom-center moves to the origin.
 * This is the same rule the Single Mesh Lab evaluation protocol applies, and it
 * deliberately does not claim to recover an authoring-tool pivot.
 */
export function toReconstructionFrame(mesh) {
  const bounds = meshBounds(mesh);
  const origin = [
    (bounds.min[0] + bounds.max[0]) * 0.5,
    bounds.min[1],
    (bounds.min[2] + bounds.max[2]) * 0.5,
  ];
  const positions = new Float64Array(mesh.positions.length);
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      positions[offset + axis] = mesh.positions[offset + axis] - origin[axis];
    }
  }
  return {
    mesh: createMesh({ positions, indices: mesh.indices, name: mesh.name }),
    originInSourceWorld: origin,
    sourceWorldBounds: bounds,
  };
}

export function meshSurfaceArea(mesh) {
  let area = 0;
  for (let face = 0; face < mesh.indices.length; face += 3) {
    const [a, b, c] = [0, 1, 2].map((corner) => mesh.indices[face + corner] * 3);
    const ab = [0, 1, 2].map((axis) => mesh.positions[b + axis] - mesh.positions[a + axis]);
    const ac = [0, 1, 2].map((axis) => mesh.positions[c + axis] - mesh.positions[a + axis]);
    area +=
      Math.hypot(
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ) * 0.5;
  }
  return area;
}
