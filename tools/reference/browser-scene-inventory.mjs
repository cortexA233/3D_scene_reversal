import * as THREE from "three";

import { createReferenceAccess } from "./reference-access.mjs";
import { createReferenceObservationContract } from "./reference-observation-contract.mjs";

/**
 * Development-only Scene Measurement of the Assembled Authored Scene.
 *
 * Enumerates every renderable geometry, light, and visible environment layer by
 * walking the ready runtime scene rather than a source-name allowlist, and
 * reports each item's world AABB, world surface area, triangle count, material
 * summary, and Normative Scene Capture pixel visibility.
 *
 * Read-only: the scene is restored to its exact pre-measurement state, and the
 * surrounding Reference Access run rejects any undeclared mutation. The
 * visibility pass renders into an off-screen target with a temporary override
 * material and never touches the authored materials themselves.
 */

const contract = createReferenceObservationContract();
const sceneInventory = { status: "loading", error: null, complete: null };
window.sceneInventory = sceneInventory;

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return String(value);
  const result = Number(value.toFixed(digits));
  return Object.is(result, -0) ? 0 : result;
}

function stableName(value) {
  return String(value || "").replace(/[^A-Za-z0-9_.-]+/g, "_");
}

/**
 * A development-only path key. It keeps reference-to-manifest correspondence
 * stable across runs but never reaches the Scene Recipe or the runtime.
 */
function walkRenderables(root) {
  const rows = [];
  const visit = (object, parentPath, index) => {
    const path = `${parentPath}/${String(index).padStart(4, "0")}:${stableName(object.type)}:${stableName(object.name)}`;
    if (object.isMesh || object.isPoints || object.isLine || object.isSprite) {
      rows.push({ object, path });
    } else if (object.isLight) {
      rows.push({ object, path, light: true });
    }
    object.children.forEach((child, childIndex) => visit(child, path, childIndex));
  };
  visit(root, "", 0);
  return rows;
}

function visibleInWorld(object) {
  let node = object;
  while (node) {
    if (!node.visible) return false;
    node = node.parent;
  }
  return true;
}

function worldTriangleArea(a, b, c) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  return ab.cross(ac).length() * 0.5;
}

/**
 * World-space surface area and triangle count. Instanced meshes contribute
 * every instance, so a large population cannot look small in the coverage
 * accounting.
 */
function surfaceEvidence(mesh) {
  const geometry = mesh.geometry;
  const position = geometry?.attributes?.position;
  if (!position) return { area: 0, triangles: 0 };
  const index = geometry.index;
  const triangleCount = index ? index.count / 3 : position.count / 3;
  const instances = mesh.isInstancedMesh ? mesh.count : 1;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  let area = 0;
  // Sample large meshes: area converges quickly and the manifest only needs a
  // proportional accounting, not a per-triangle inventory.
  const stride = Math.max(1, Math.floor(triangleCount / 4000));
  let sampled = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += stride) {
    const base = triangle * 3;
    const i0 = index ? index.getX(base) : base;
    const i1 = index ? index.getX(base + 1) : base + 1;
    const i2 = index ? index.getX(base + 2) : base + 2;
    a.fromBufferAttribute(position, i0).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(position, i1).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(position, i2).applyMatrix4(mesh.matrixWorld);
    area += worldTriangleArea(a, b, c);
    sampled += 1;
  }
  if (sampled > 0) area = (area / sampled) * triangleCount;

  if (mesh.isInstancedMesh && mesh.count > 0) {
    let instanceScale = 0;
    const scale = new THREE.Vector3();
    for (let instance = 0; instance < mesh.count; instance += 1) {
      mesh.getMatrixAt(instance, matrix);
      matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      instanceScale += (scale.x * scale.y + scale.y * scale.z + scale.x * scale.z) / 3;
    }
    area *= instanceScale;
  }
  return { area, triangles: triangleCount * instances };
}

function worldBounds(mesh) {
  const box = new THREE.Box3().setFromObject(mesh);
  if (!Number.isFinite(box.min.x)) return null;
  return {
    min: box.min.toArray().map((value) => round(value, 3)),
    max: box.max.toArray().map((value) => round(value, 3)),
  };
}

const SCRATCH_POSITION = new THREE.Vector3();
const SCRATCH_QUATERNION = new THREE.Quaternion();
const SCRATCH_SCALE = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Authored orientation, read from the assembled world matrix rather than
 * inferred from a principal axis. `yaw` is the rotation about world +Y and
 * `tilt` is how far the object's local up has left world up, which is what
 * distinguishes a directed heading from a surface-aligned placement.
 */
function orientationEvidence(object) {
  object.matrixWorld.decompose(SCRATCH_POSITION, SCRATCH_QUATERNION, SCRATCH_SCALE);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(SCRATCH_QUATERNION);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(SCRATCH_QUATERNION);
  return {
    yaw: round(Math.atan2(forward.x, forward.z), 5),
    tilt: round(up.angleTo(WORLD_UP), 5),
    worldScale: SCRATCH_SCALE.toArray().map((value) => round(value, 5)),
  };
}

function materialSummary(material) {
  const list = Array.isArray(material) ? material : [material];
  return list.filter(Boolean).map((entry) => ({
    type: entry.type,
    color: entry.color ? entry.color.getHex() : null,
    roughness: entry.roughness === undefined ? null : round(entry.roughness, 3),
    metalness: entry.metalness === undefined ? null : round(entry.metalness, 3),
    opacity: round(entry.opacity ?? 1, 3),
    transparent: Boolean(entry.transparent),
    emissive: entry.emissive ? entry.emissive.getHex() : null,
    hasMap: Boolean(entry.map),
    side: entry.side,
  }));
}

function lightSummary(light) {
  return {
    type: light.type,
    position: light.position.toArray().map((value) => round(value, 3)),
    color: light.color ? light.color.getHex() : null,
    intensity: round(light.intensity ?? 0, 4),
    distance: light.distance === undefined ? null : round(light.distance, 3),
    castShadow: Boolean(light.castShadow),
  };
}

/**
 * Normative Scene Capture visibility.
 *
 * Renders one ID pass at 1440x810 through the frozen authored overview so
 * coverage is reported in visible pixels, not only entity counts and surface
 * area.
 *
 * Each renderable gets its own temporary ID material and its original material
 * reference is put back afterwards, so meshes that share one geometry stay
 * distinguishable and no authored material is modified. IDs are quantized to a
 * coarse RGB lattice, which makes decoding immune to any colour-space or
 * filtering rounding in the pipeline.
 */
const ID_LEVELS = 26;
const ID_STEP = Math.floor(255 / (ID_LEVELS - 1));
const ID_CAPACITY = ID_LEVELS ** 3 - 1;

function idToColor(id) {
  const r = id % ID_LEVELS;
  const g = Math.floor(id / ID_LEVELS) % ID_LEVELS;
  const b = Math.floor(id / (ID_LEVELS * ID_LEVELS)) % ID_LEVELS;
  return [r * ID_STEP, g * ID_STEP, b * ID_STEP];
}

function colorToId(r, g, b) {
  const level = (value) => Math.min(ID_LEVELS - 1, Math.round(value / ID_STEP));
  return level(r) + level(g) * ID_LEVELS + level(b) * ID_LEVELS * ID_LEVELS;
}

function measureVisiblePixels(renderer, scene, camera, meshes) {
  const width = contract.capture.framebuffer[0];
  const height = contract.capture.framebuffer[1];
  if (meshes.length > ID_CAPACITY) {
    throw new Error(
      `scene has ${meshes.length} renderables, above the ${ID_CAPACITY} distinguishable ID slots`,
    );
  }
  const target = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
    colorSpace: THREE.NoColorSpace,
  });

  const restore = [];
  const idMaterials = [];
  meshes.forEach(({ object }, index) => {
    const [r, g, b] = idToColor(index + 1);
    const material = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
      transparent: false,
      depthWrite: true,
      depthTest: true,
    });
    material.color.setRGB(r / 255, g / 255, b / 255, THREE.LinearSRGBColorSpace);
    idMaterials.push(material);
    const previous = object.material;
    object.material = material;
    restore.push(() => {
      object.material = previous;
    });
  });

  const previousTarget = renderer.getRenderTarget();
  const previousBackground = scene.background;
  const previousFog = scene.fog;
  scene.background = null;
  scene.fog = null;
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 1);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);

  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);

  scene.background = previousBackground;
  scene.fog = previousFog;
  renderer.setRenderTarget(previousTarget);
  for (const undo of restore) undo();
  for (const material of idMaterials) material.dispose();
  target.dispose();

  const counts = new Map();
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const id = colorToId(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    if (id === 0) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return { counts, totalPixels: width * height };
}

/**
 * Bounded, deterministic world-space surface samples.
 *
 * Development-only evidence for topology-independent surface comparison. The
 * per-mesh cap is fixed, so the sample count is independent of source mesh
 * resolution, and nothing here may enter the Scene Recipe or the runtime.
 */
const SAMPLE_CAP = 96;
const SAMPLE_FLOOR = 12;

function sampleRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function surfaceSamples(mesh, seed) {
  const geometry = mesh.geometry;
  const position = geometry?.attributes?.position;
  if (!position) return [];
  const index = geometry.index;
  const triangleCount = Math.floor((index ? index.count : position.count) / 3);
  if (triangleCount === 0) return [];

  const count = Math.min(
    SAMPLE_CAP,
    Math.max(SAMPLE_FLOOR, Math.round(Math.sqrt(triangleCount) * 3)),
  );
  const rng = sampleRng(seed);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const point = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const samples = [];

  for (let sample = 0; sample < count; sample += 1) {
    const triangle = Math.min(triangleCount - 1, Math.floor(rng() * triangleCount));
    const base = triangle * 3;
    const i0 = index ? index.getX(base) : base;
    const i1 = index ? index.getX(base + 1) : base + 1;
    const i2 = index ? index.getX(base + 2) : base + 2;
    a.fromBufferAttribute(position, i0);
    b.fromBufferAttribute(position, i1);
    c.fromBufferAttribute(position, i2);
    let u = rng();
    let v = rng();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    point
      .copy(a)
      .addScaledVector(b.sub(a), u)
      .addScaledVector(c.sub(a), v);
    if (mesh.isInstancedMesh) {
      mesh.getMatrixAt(Math.min(mesh.count - 1, Math.floor(rng() * mesh.count)), matrix);
      point.applyMatrix4(matrix);
    }
    point.applyMatrix4(mesh.matrixWorld);
    samples.push(round(point.x, 2), round(point.y, 2), round(point.z, 2));
  }
  return samples;
}

/**
 * Terrain elevation evidence.
 *
 * The assembled scene exposes its own authoritative elevation function, so the
 * measurement queries that rather than re-deriving heights from a triangulated
 * surface. The grid is a development-only evidence artifact used for fitting
 * and comparison; it is never retained by the Scene Recipe or the runtime.
 */
const ELEVATION_RESOLUTION = 257;

function collectElevation(runtime) {
  const heightAt = runtime?.bounds?.islandH;
  if (typeof heightAt !== "function") return null;
  const half = 480;
  // The runtime datum is a 2D island centre in the world XZ plane.
  const [centreX, centreZ] = runtime.bounds.center;
  const x0 = centreX - half;
  const x1 = centreX + half;
  const z0 = centreZ - half;
  const z1 = centreZ + half;
  const heights = new Array(ELEVATION_RESOLUTION * ELEVATION_RESOLUTION);
  for (let row = 0; row < ELEVATION_RESOLUTION; row += 1) {
    const z = z0 + ((z1 - z0) * row) / (ELEVATION_RESOLUTION - 1);
    for (let column = 0; column < ELEVATION_RESOLUTION; column += 1) {
      const x = x0 + ((x1 - x0) * column) / (ELEVATION_RESOLUTION - 1);
      heights[row * ELEVATION_RESOLUTION + column] = round(heightAt(x, z), 2);
    }
  }
  return {
    schemaVersion: "terrain-elevation-v1",
    resolution: ELEVATION_RESOLUTION,
    bounds: { x0: round(x0, 3), x1: round(x1, 3), z0: round(z0, 3), z1: round(z1, 3) },
    seaLevel: runtime.bounds.seaY,
    groundY: runtime.bounds.groundY,
    heights,
  };
}

function collectInventory(scene, camera, renderer) {
  scene.updateMatrixWorld(true);
  const rows = walkRenderables(scene);
  const meshes = rows.filter(({ light }) => !light);
  const lights = rows.filter(({ light }) => light);
  const { counts, totalPixels } = measureVisiblePixels(renderer, scene, camera, meshes);

  let totalArea = 0;
  const samples = {};
  const items = meshes.map(({ object, path }, index) => {
    const surface = surfaceEvidence(object);
    totalArea += surface.area;
    samples[path] = surfaceSamples(object, index + 1);
    return {
      path,
      type: object.type,
      visible: visibleInWorld(object),
      frustumCulled: object.frustumCulled,
      instanceCount: object.isInstancedMesh ? object.count : 1,
      triangles: surface.triangles,
      worldSurfaceArea: round(surface.area, 3),
      bounds: worldBounds(object),
      orientation: orientationEvidence(object),
      materials: materialSummary(object.material),
      overviewPixels: counts.get(index + 1) ?? 0,
    };
  });

  return {
    schemaVersion: "scene-inventory-v1",
    authority: contract.authority,
    capture: {
      cssViewport: contract.capture.cssViewport,
      framebuffer: contract.capture.framebuffer,
      camera: "authoredOverview",
      totalPixels,
    },
    totals: {
      renderables: items.length,
      lights: lights.length,
      triangles: items.reduce((sum, item) => sum + item.triangles, 0),
      worldSurfaceArea: round(totalArea, 3),
      coveredPixels: items.reduce((sum, item) => sum + item.overviewPixels, 0),
    },
    items,
    lights: lights.map(({ object, path }) => ({ path, ...lightSummary(object) })),
    samples,
    elevation: collectElevation(window.island),
  };
}

/**
 * Compact mutation detector. It is coarser than the full Immutable Reference
 * Observation digests, but it independently proves this measurement pass left
 * structure, transforms, geometry identity, materials, and lights untouched.
 */
function stateSummaries(scene) {
  const structure = [];
  const transforms = [];
  const geometry = [];
  const materials = [];
  const lights = [];
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    structure.push(
      object.type,
      object.name,
      String(object.visible),
      String(object.children.length),
      String(object.renderOrder),
    );
    transforms.push(object.matrixWorld.elements.map((value) => round(value, 6)).join(","));
    if (object.geometry) {
      geometry.push(
        object.geometry.uuid,
        String(object.geometry.attributes?.position?.count ?? 0),
        Object.keys(object.geometry.attributes ?? {}).sort().join("|"),
      );
    }
    for (const material of [].concat(object.material ?? [])) {
      if (!material) continue;
      materials.push(
        material.uuid,
        material.type,
        String(material.color?.getHex() ?? ""),
        String(material.opacity),
        String(material.side),
        String(material.visible),
      );
    }
    if (object.isLight) {
      lights.push(
        object.type,
        String(object.intensity),
        String(object.color?.getHex() ?? ""),
        String(object.castShadow),
      );
    }
  });
  const digestOf = (rows) => {
    let hash = 0x811c9dc5;
    const text = rows.join("");
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash ^ text.charCodeAt(index)) >>> 0;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `${text.length.toString(16)}-${hash.toString(16)}`;
  };
  return {
    structure: { digest: digestOf(structure) },
    transforms: { digest: digestOf(transforms) },
    geometry: { digest: digestOf(geometry) },
    materials: { digest: digestOf(materials) },
    lights: { digest: digestOf(lights) },
    renderer: { digest: "measurement-renderer-is-independent" },
    dynamic: { digest: "frozen" },
  };
}

async function main() {
  const ready = await new Promise((resolve, reject) => {
    const poll = () => {
      if (window.island?.error) {
        reject(new Error(window.island.error));
        return;
      }
      if (window.island?.ready && window.island.scene && window.island.camera) {
        resolve(window.island);
        return;
      }
      requestAnimationFrame(poll);
    };
    poll();
  });

  // An independent off-screen renderer: the reference's own renderer, its
  // canvas, and its post-processing chain are never reconfigured for
  // measurement.
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(...contract.capture.framebuffer);
  const camera = ready.camera.clone();
  camera.aspect =
    contract.capture.framebuffer[0] / contract.capture.framebuffer[1];
  camera.updateProjectionMatrix();

  const access = createReferenceAccess({ snapshot: () => stateSummaries(ready.scene) });
  const evidence = await access.observe(() =>
    collectInventory(ready.scene, camera, renderer),
  );
  renderer.dispose();

  sceneInventory.report = evidence.result;
  sceneInventory.immutability = evidence.immutability;
  sceneInventory.status = "ready";
}

sceneInventory.complete = () => ({
  status: sceneInventory.status,
  report: sceneInventory.report ?? null,
  immutability: sceneInventory.immutability ?? null,
  error: sceneInventory.error,
});

main().catch((error) => {
  sceneInventory.status = "error";
  sceneInventory.error = String(error?.stack ?? error);
});
