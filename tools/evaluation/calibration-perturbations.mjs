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
