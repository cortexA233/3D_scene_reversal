import * as THREE from "three";

function cloneMaterial(material) {
  return Array.isArray(material)
    ? material.map((entry) => entry.clone())
    : material.clone();
}

export function createLocalReferenceClone(reference) {
  const bottomCenter = [
    (reference.worldBounds.min[0] + reference.worldBounds.max[0]) * 0.5,
    reference.worldBounds.min[1],
    (reference.worldBounds.min[2] + reference.worldBounds.max[2]) * 0.5,
  ];
  const geometry = reference.root.geometry.clone();
  geometry.translate(...bottomCenter.map((value) => -value));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const root = new THREE.Mesh(geometry, cloneMaterial(reference.root.material));
  root.name = `Calibration Copy · ${reference.label}`;
  root.userData.semanticId = `calibration.${reference.id}`;
  root.userData.reconstructionUnitId = reference.id;
  return root;
}

function faceRecords(geometry) {
  const position = geometry.getAttribute("position");
  if (!position) throw new Error("geometry has no position attribute");
  const indices = geometry.index
    ? Array.from(geometry.index.array)
    : Array.from({ length: position.count }, (_, index) => index);
  if (indices.length % 3 !== 0) {
    throw new RangeError("geometry index count must be a multiple of three");
  }
  const bounds = new THREE.Box3().setFromBufferAttribute(position);
  const size = new THREE.Vector3();
  bounds.getSize(size);
  const tolerance = Math.max(size.x, size.y, size.z) * 1e-6 || 1e-9;
  const weldedByCell = new Map();
  const welded = new Uint32Array(position.count);
  let nextWelded = 0;
  for (let index = 0; index < position.count; index += 1) {
    const key = [position.getX(index), position.getY(index), position.getZ(index)]
      .map((value) => Math.round(value / tolerance))
      .join(":");
    if (!weldedByCell.has(key)) weldedByCell.set(key, nextWelded++);
    welded[index] = weldedByCell.get(key);
  }
  const parent = Array.from({ length: nextWelded }, (_, index) => index);
  const find = (value) => {
    while (parent[value] !== value) {
      parent[value] = parent[parent[value]];
      value = parent[value];
    }
    return value;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };
  const faces = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  for (let offset = 0; offset < indices.length; offset += 3) {
    const vertices = indices.slice(offset, offset + 3);
    const welds = vertices.map((index) => welded[index]);
    union(welds[0], welds[1]);
    union(welds[1], welds[2]);
    a.fromBufferAttribute(position, vertices[0]);
    b.fromBufferAttribute(position, vertices[1]);
    c.fromBufferAttribute(position, vertices[2]);
    const area = cross
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .length() * 0.5;
    faces.push({ vertices, weld: welds[0], area });
  }
  const components = new Map();
  faces.forEach((face, faceIndex) => {
    const root = find(face.weld);
    const component = components.get(root) ?? { faceIndices: [], area: 0 };
    component.faceIndices.push(faceIndex);
    component.area += face.area;
    components.set(root, component);
  });
  return { faces, components: [...components.values()] };
}

function geometryWithoutFaces(geometry, faces, removed) {
  const result = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const values = [];
    faces.forEach((face, faceIndex) => {
      if (removed.has(faceIndex)) return;
      for (const vertex of face.vertices) {
        for (let component = 0; component < attribute.itemSize; component += 1) {
          values.push(attribute.array[vertex * attribute.itemSize + component]);
        }
      }
    });
    const ArrayType = attribute.array.constructor;
    result.setAttribute(
      name,
      new THREE.BufferAttribute(
        new ArrayType(values),
        attribute.itemSize,
        attribute.normalized,
      ),
    );
  }
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

export function removeMeaningfulComponent(geometry) {
  const { faces, components } = faceRecords(geometry);
  if (components.length < 2) {
    throw new Error("component deletion requires at least two connected components");
  }
  const ordered = [...components].sort(
    (first, second) =>
      second.area - first.area ||
      second.faceIndices.length - first.faceIndices.length,
  );
  const selected = ordered[1];
  const removed = new Set(selected.faceIndices);
  return {
    geometry: geometryWithoutFaces(geometry, faces, removed),
    metadata: {
      strategy: "largest-non-dominant-connected-component",
      sourceComponentCount: components.length,
      removedTriangleCount: selected.faceIndices.length,
      retainedTriangleCount: faces.length - selected.faceIndices.length,
      removedSurfaceArea: selected.area,
      removedSurfaceAreaFraction:
        selected.area /
        components.reduce((sum, component) => sum + component.area, 0),
    },
  };
}

export function removeMeaningfulComponentFamily(
  geometry,
  minimumSurfaceAreaFraction = 0.2,
) {
  if (
    minimumSurfaceAreaFraction !== null &&
    !(minimumSurfaceAreaFraction > 0 && minimumSurfaceAreaFraction < 1)
  ) {
    throw new RangeError("component-family deletion fraction must be between zero and one");
  }
  const { faces, components } = faceRecords(geometry);
  if (components.length < 3) {
    throw new Error("component-family deletion requires at least three connected components");
  }
  const ordered = [...components].sort(
    (first, second) =>
      second.area - first.area ||
      second.faceIndices.length - first.faceIndices.length,
  );
  const totalArea = ordered.reduce((sum, component) => sum + component.area, 0);
  const selected = [];
  let removedArea = 0;
  for (const component of ordered.slice(1)) {
    selected.push(component);
    removedArea += component.area;
    if (
      minimumSurfaceAreaFraction !== null &&
      removedArea / totalArea >= minimumSurfaceAreaFraction
    ) break;
  }
  if (
    minimumSurfaceAreaFraction !== null &&
    removedArea / totalArea < minimumSurfaceAreaFraction
  ) {
    throw new Error("non-dominant component family is below the requested area fraction");
  }
  const removed = new Set(
    selected.flatMap((component) => component.faceIndices),
  );
  return {
    geometry: geometryWithoutFaces(geometry, faces, removed),
    metadata: {
      strategy: "largest-non-dominant-component-family",
      sourceComponentCount: components.length,
      removedComponentCount: selected.length,
      removedTriangleCount: removed.size,
      retainedTriangleCount: faces.length - removed.size,
      removedSurfaceArea: removedArea,
      removedSurfaceAreaFraction: removedArea / totalArea,
      minimumSurfaceAreaFraction,
      removedAllNonDominantComponents: minimumSurfaceAreaFraction === null,
    },
  };
}

export function quantizeRadialResolution(geometry, segmentCount) {
  if (!Number.isInteger(segmentCount) || segmentCount < 3) {
    throw new RangeError("segmentCount must be an integer of at least three");
  }
  const result = geometry.clone();
  const position = result.getAttribute("position");
  const step = (Math.PI * 2) / segmentCount;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const radius = Math.hypot(x, z);
    if (radius < 1e-12) continue;
    const angle = Math.round(Math.atan2(z, x) / step) * step;
    position.setX(index, Math.cos(angle) * radius);
    position.setZ(index, Math.sin(angle) * radius);
  }
  position.needsUpdate = true;
  result.computeVertexNormals();
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

function stoneSupportDirections(directionCount) {
  if (![8, 12, 16, 24].includes(directionCount)) {
    throw new RangeError("Stone calibration support count must be 8, 12, 16, or 24");
  }
  const directions = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ];
  const phase = -Math.PI / 6;
  const additional = [];
  for (let index = 0; index < 4; index += 1) {
    const angle = phase + index * Math.PI / 2;
    for (const azimuth of [angle, angle + Math.PI / 4]) {
      additional.push(
        new THREE.Vector3(Math.cos(azimuth), 0.5, Math.sin(azimuth)).normalize(),
      );
    }
  }
  for (let index = 0; index < 4; index += 1) {
    const angle = phase + index * Math.PI / 2;
    for (const azimuth of [angle, angle + Math.PI / 4]) {
      additional.push(
        new THREE.Vector3(Math.cos(azimuth), 3, Math.sin(azimuth)).normalize(),
      );
    }
  }
  for (const azimuth of [phase, phase + Math.PI]) {
    additional.push(
      new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth)),
    );
  }
  directions.push(...additional.slice(0, directionCount - directions.length));
  return directions;
}

function planeIntersection(first, second, third) {
  const cross = new THREE.Vector3().crossVectors(second.normal, third.normal);
  const denominator = first.normal.dot(cross);
  if (Math.abs(denominator) < 1e-9) return null;
  return cross
    .multiplyScalar(first.distance)
    .add(
      new THREE.Vector3()
        .crossVectors(third.normal, first.normal)
        .multiplyScalar(second.distance),
    )
    .add(
      new THREE.Vector3()
        .crossVectors(first.normal, second.normal)
        .multiplyScalar(third.distance),
    )
    .multiplyScalar(1 / denominator);
}

function supportPolyhedronGeometry(planes) {
  const vertices = [];
  for (let first = 0; first < planes.length - 2; first += 1) {
    for (let second = first + 1; second < planes.length - 1; second += 1) {
      for (let third = second + 1; third < planes.length; third += 1) {
        const point = planeIntersection(
          planes[first],
          planes[second],
          planes[third],
        );
        if (!point) continue;
        if (planes.some(
          (plane) => plane.normal.dot(point) > plane.distance + 1e-7,
        )) continue;
        if (vertices.some(
          (entry) => entry.distanceToSquared(point) < 1e-10,
        )) continue;
        vertices.push(point);
      }
    }
  }
  const indices = [];
  for (const plane of planes) {
    const face = vertices
      .map((point, index) => ({ point, index }))
      .filter(({ point }) =>
        Math.abs(plane.normal.dot(point) - plane.distance) < 1e-5
      );
    if (face.length < 3) continue;
    const center = face
      .reduce((sum, entry) => sum.add(entry.point), new THREE.Vector3())
      .multiplyScalar(1 / face.length);
    const guide = Math.abs(plane.normal.y) > 0.5
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3()
      .crossVectors(guide, plane.normal)
      .normalize();
    const bitangent = new THREE.Vector3()
      .crossVectors(plane.normal, tangent)
      .normalize();
    face.sort((left, right) => {
      const leftOffset = left.point.clone().sub(center);
      const rightOffset = right.point.clone().sub(center);
      return Math.atan2(
        leftOffset.dot(bitangent),
        leftOffset.dot(tangent),
      ) - Math.atan2(
        rightOffset.dot(bitangent),
        rightOffset.dot(tangent),
      );
    });
    for (let index = 1; index < face.length - 1; index += 1) {
      indices.push(face[0].index, face[index].index, face[index + 1].index);
    }
  }
  if (vertices.length < 4 || indices.length < 12) {
    throw new Error("Stone calibration support hull is degenerate");
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      vertices.flatMap((point) => point.toArray()),
      3,
    ),
  );
  result.setIndex(indices);
  result.computeVertexNormals();
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

export function createStoneSupportHull(geometry, directionCount) {
  const position = geometry.getAttribute("position");
  if (!position) throw new Error("geometry has no position attribute");
  const point = new THREE.Vector3();
  const directions = stoneSupportDirections(directionCount);
  const distances = directions.map((normal) => {
    let maximum = -Infinity;
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index);
      maximum = Math.max(maximum, point.dot(normal));
    }
    return maximum;
  });
  return supportPolyhedronGeometry(
    directions.map((normal, index) => ({
      normal,
      distance: distances[index],
    })),
  );
}

function transformedGeometry(geometry, transform) {
  const result = geometry.clone();
  const position = result.getAttribute("position");
  const point = new THREE.Vector3();
  const bounds = new THREE.Box3().setFromBufferAttribute(position);
  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index);
    transform(point, bounds);
    position.setXYZ(index, point.x, point.y, point.z);
  }
  position.needsUpdate = true;
  result.computeVertexNormals();
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

export function compressStoneProfile(geometry, exponentDelta) {
  if (!(exponentDelta > 0)) {
    throw new RangeError("profile exponent delta must be positive");
  }
  return transformedGeometry(geometry, (point, bounds) => {
    const height = bounds.max.y - bounds.min.y;
    const progress = (point.y - bounds.min.y) / height;
    point.y = bounds.min.y + Math.pow(progress, 1 + exponentDelta) * height;
  });
}

export function shearStoneGeometry(geometry, factor) {
  if (!(factor > 0)) throw new RangeError("shear factor must be positive");
  return transformedGeometry(geometry, (point, bounds) => {
    const height = bounds.max.y - bounds.min.y;
    const progress = (point.y - bounds.min.y) / height;
    point.x += (progress - 0.5) * height * factor;
  });
}

export function createStoneStructuralSubstitute(geometry, shape) {
  const position = geometry.getAttribute("position");
  if (!position) throw new Error("geometry has no position attribute");
  const bounds = new THREE.Box3().setFromBufferAttribute(position);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  let result;
  if (shape === "ellipsoid") {
    result = new THREE.SphereGeometry(0.5, 16, 8);
  } else if (shape === "box") {
    result = new THREE.BoxGeometry(1, 1, 1);
  } else {
    throw new Error(`unknown Stone structural substitute: ${shape}`);
  }
  result.scale(size.x, size.y, size.z);
  result.translate(center.x, center.y, center.z);
  result.computeVertexNormals();
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}
