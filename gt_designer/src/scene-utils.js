// Shared utilities for the compact island scene schema.
import * as THREE from "three";

export function matrixFromRows(rows, target = new THREE.Matrix4()) {
  if (!rows) return target.identity();
  target.set(
    rows[0],
    rows[1],
    rows[2],
    rows[3],
    rows[4],
    rows[5],
    rows[6],
    rows[7],
    rows[8],
    rows[9],
    rows[10],
    rows[11],
    0,
    0,
    0,
    1,
  );
  return target;
}

export function vector3(values, fallback = 0) {
  if (!values) return new THREE.Vector3(fallback, fallback, fallback);
  return new THREE.Vector3(
    values[0] ?? fallback,
    values[1] ?? fallback,
    values[2] ?? fallback,
  );
}

const DEFAULT_COLOR = new THREE.Color().setRGB(
  0.639,
  0.635,
  0.647,
  THREE.SRGBColorSpace,
);

export function colorOf(properties) {
  const color = properties?.color;
  if (!color) return DEFAULT_COLOR.clone();
  return new THREE.Color().setRGB(
    color[0],
    color[1],
    color[2],
    THREE.SRGBColorSpace,
  );
}

export function numberProperty(properties, key, fallback = 0) {
  const value = properties?.[key];
  if (value === undefined || value === "" || value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function booleanProperty(properties, key, fallback = false) {
  const value = properties?.[key];
  return value === undefined ? fallback : value === true;
}

const MATERIALS = {
  Polymer: { roughness: 0.62, metalness: 0 },
  "Smooth Polymer": { roughness: 0.3, metalness: 0 },
  Neon: { roughness: 0.4, metalness: 0, emissive: true },
  Wood: { roughness: 0.85, metalness: 0 },
  "Wood Planks": { roughness: 0.8, metalness: 0 },
  Slate: { roughness: 0.9, metalness: 0 },
  Concrete: { roughness: 0.92, metalness: 0 },
  Brick: { roughness: 0.95, metalness: 0 },
  Cobblestone: { roughness: 0.95, metalness: 0 },
  Granite: { roughness: 0.7, metalness: 0 },
  Marble: { roughness: 0.6, metalness: 0 },
  Foil: { roughness: 0.3, metalness: 1 },
  Metal: { roughness: 0.35, metalness: 1 },
  "Diamond Plate": { roughness: 0.45, metalness: 1 },
  "Weathered Metal": { roughness: 0.5, metalness: 0.9 },
  Grass: { roughness: 1, metalness: 0 },
  Sand: { roughness: 1, metalness: 0 },
  Fabric: { roughness: 0.9, metalness: 0 },
  Sandstone: { roughness: 0.85, metalness: 0 },
  Glass: { roughness: 0.05, metalness: 0, glass: true },
  Water: { roughness: 0.1, metalness: 0, water: true },
};

export function materialProperties(name) {
  return MATERIALS[name] || { roughness: 0.7, metalness: 0 };
}

export function wedgeGeometry() {
  const h = 0.5;
  const vertices = [
    -h,
    -h,
    h,
    h,
    -h,
    h,
    h,
    -h,
    -h,
    -h,
    -h,
    -h,
    -h,
    h,
    -h,
    h,
    h,
    -h,
  ];
  const indices = [
    0, 1, 2, 0, 2, 3, 4, 5, 1, 4, 1, 0, 3, 2, 5, 3, 5, 4, 0, 3, 4, 1, 5, 2,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
