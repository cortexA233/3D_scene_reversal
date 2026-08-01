import * as THREE from "three";

import {
  HORIZON_BINS,
  accumulateMeshTriangles,
  createProfileAccumulator,
} from "../evaluation/horizon-profile.mjs";
import { tintedInstancedMeshes } from "../evaluation/scene-pass-encoding.mjs";
import {
  allocateSamples,
  sampleBudget,
  sampleMeshSurface,
  surfaceAreaOf,
  triangleCountOf,
} from "../evaluation/surface-sampling.mjs";
import { HORIZON_PEAK_CAP, placementKey } from "../reconstruction/scene-placements.mjs";
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
  // three.js multiplies a material's colour by an InstancedMesh's per-instance
  // colour whenever one is present, so an identity written onto a mesh that
  // carries `instanceColor` comes back tinted and decodes as a different mesh.
  // Two of the reference's five cover populations call `setColorAt`; measured,
  // that lost 5,100 authored instances from this pass and credited their pixels
  // to whichever identity the tinted value happened to land on. Suppressed for
  // the pass and restored with the materials.
  for (const object of tintedInstancedMeshes(scene)) {
    const instanceColor = object.instanceColor;
    object.instanceColor = null;
    restore.push(() => {
      object.instanceColor = instanceColor;
    });
  }
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
 * Bounded, deterministic world-space surface samples, using the same rule the
 * candidate side uses rather than a second copy of it.
 *
 * Two copies of a sampling rule is how the reference and the candidate came to be
 * sampled differently while both formulas read identically. The budget belongs to a
 * *placement*: this side used to give each renderable its own, so an authored
 * placement made of five meshes drew five budgets and one made of a single mesh drew
 * one. ADR-0055 has the measurements.
 *
 * Development-only; nothing here may enter the Scene Recipe or the runtime.
 */
function placementSamples(meshes) {
  const groups = new Map();
  for (const row of meshes) {
    const key = placementKey(row.path)?.key ?? row.path;
    const entry = groups.get(key) ?? [];
    entry.push(row);
    groups.set(key, entry);
  }
  const samples = {};
  for (const members of groups.values()) {
    const triangleCounts = members.map((member) => triangleCountOf(member.object.geometry));
    const budget = sampleBudget(triangleCounts.reduce((sum, count) => sum + count, 0));
    // By area, not by triangle count — ADR-0061. Both sides import one implementation,
    // so the split here and the split in `sampleEntitySurface` cannot drift apart.
    const allocation = allocateSamples(
      members.map((member) => surfaceAreaOf(member.object)),
      budget,
    );
    members.forEach((member, slot) => {
      // Seeded by the member's position within its own placement, so a placement's
      // samples do not depend on where it sits in the scene walk.
      samples[member.path] = sampleMeshSurface(member.object, slot + 1, allocation[slot]);
    });
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

/**
 * Horizon evidence.
 *
 * The Horizon Profile is the elevation angle of visible distant geometry as a
 * function of azimuth around the fixed Scene Anchor. It is computed exactly
 * from the distant meshes' own vertices rather than from a screenshot, so it is
 * independent of any camera, and each Horizon Group also keeps its own profile
 * and a bounded set of local peak descriptors.
 */
const HORIZON_MINIMUM_DISTANCE = 700;
const HORIZON_MAXIMUM_SPAN = 2000;
const HORIZON_MINIMUM_HEIGHT = 50;
// Imported, not redeclared. This file kept its own copy at 8 while
// `scene-placements.mjs` held the exported one, so raising the exported cap to 24 did
// nothing: detection still stopped at 8 and the placement side then sliced 8 to 24. Every
// one of the sixteen groups reading exactly 8 is what made it visible. Two copies of one
// rule drifting apart is the defect ADR-0055 records, and the fix is the same one.

function groupHorizonProfile(mesh, anchor) {
  const accumulator = createProfileAccumulator(anchor, HORIZON_BINS);
  const point = new THREE.Vector3();
  accumulateMeshTriangles(mesh, accumulator, (local) => {
    point.set(local[0], local[1], local[2]).applyMatrix4(mesh.matrixWorld);
    return [point.x, point.y, point.z];
  });
  const measured = accumulator.result();
  if (!measured.depthInterval) return null;
  return {
    profile: measured.profile.map((value) => (value === null ? null : round(value, 6))),
    depthInterval: measured.depthInterval.map((value) => round(value, 2)),
  };
}

/**
 * A bounded set of local peaks in the group's own frame, expressed as
 * normalized offsets so a generator can reproduce the multi-form shape without
 * copying vertices.
 */
function groupPeaks(mesh) {
  const position = mesh.geometry?.attributes?.position;
  if (!position) return [];
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  // 24 cells, from 12, and a 0.2 height floor from 0.35 (ADR-0052 enlargement).
  //
  // These two and HORIZON_PEAK_CAP are the Horizon Group's control budget, and the cap
  // was never the binding one: at 12 cells and a 0.35 floor the sixteen groups detect
  // 5,4,4,4,4,5,2,2,2,1,1,2,2,3,3,3 summits against a cap of 8. A 891-unit mountain was
  // being searched for local maxima on 74-unit cells, so a ridge could carry at most a
  // handful of nodes however large the cap allowed.
  const cells = 40;
  const heights = new Array(cells * cells).fill(Number.NEGATIVE_INFINITY);
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
    const u = Math.min(cells - 1, Math.max(0, Math.floor(((point.x - box.min.x) / Math.max(1e-6, size.x)) * cells)));
    const v = Math.min(cells - 1, Math.max(0, Math.floor(((point.z - box.min.z) / Math.max(1e-6, size.z)) * cells)));
    const normalized = (point.y - box.min.y) / Math.max(1e-6, size.y);
    if (normalized > heights[v * cells + u]) heights[v * cells + u] = normalized;
  }
  const peaks = [];
  for (let v = 0; v < cells; v += 1) {
    for (let u = 0; u < cells; u += 1) {
      const height = heights[v * cells + u];
      if (!Number.isFinite(height) || height < 0.1) continue;
      let isPeak = true;
      for (let dv = -1; dv <= 1 && isPeak; dv += 1) {
        for (let du = -1; du <= 1; du += 1) {
          if (du === 0 && dv === 0) continue;
          const nu = u + du;
          const nv = v + dv;
          if (nu < 0 || nv < 0 || nu >= cells || nv >= cells) continue;
          if (heights[nv * cells + nu] > height) {
            isPeak = false;
            break;
          }
        }
      }
      if (!isPeak) continue;
      peaks.push({
        offset: [round((u + 0.5) / cells - 0.5, 4), round((v + 0.5) / cells - 0.5, 4)],
        height: round(height, 4),
      });
    }
  }
  return peaks.sort((a, b) => b.height - a.height).slice(0, HORIZON_PEAK_CAP);
}

function collectHorizon(meshes, anchor) {
  const combined = new Array(HORIZON_BINS).fill(Number.NEGATIVE_INFINITY);
  const groups = [];
  for (const { object, path } of meshes) {
    // Horizon Groups are distant landform meshes. Cloud sprites, the sky shell,
    // and the ocean plane are separate scene layers and are excluded by
    // measured type and extent rather than by name.
    if (!object.isMesh || object.isInstancedMesh) continue;
    const bounds = new THREE.Box3().setFromObject(object);
    if (!Number.isFinite(bounds.min.x)) continue;
    const size = bounds.getSize(new THREE.Vector3());
    if (Math.max(size.x, size.z) > HORIZON_MAXIMUM_SPAN || size.y < HORIZON_MINIMUM_HEIGHT) {
      continue;
    }
    const centre = bounds.getCenter(new THREE.Vector3());
    if (Math.hypot(centre.x - anchor[0], centre.z - anchor[2]) < HORIZON_MINIMUM_DISTANCE) {
      continue;
    }
    const evidence = groupHorizonProfile(object, anchor);
    if (!evidence) continue;
    groups.push({ path, ...evidence, peaks: groupPeaks(object) });
    evidence.profile.forEach((value, bin) => {
      if (value !== null && value > combined[bin]) combined[bin] = value;
    });
  }
  return {
    schemaVersion: "horizon-evidence-v1",
    anchor,
    bins: HORIZON_BINS,
    minimumDistance: HORIZON_MINIMUM_DISTANCE,
    maximumSpan: HORIZON_MAXIMUM_SPAN,
    minimumHeight: HORIZON_MINIMUM_HEIGHT,
    combined: combined.map((value) => (Number.isFinite(value) ? round(value, 6) : null)),
    groups,
  };
}

function collectInventory(scene, camera, renderer) {
  scene.updateMatrixWorld(true);
  const rows = walkRenderables(scene);
  const meshes = rows.filter(({ light }) => !light);
  const lights = rows.filter(({ light }) => light);
  const { counts, totalPixels } = measureVisiblePixels(renderer, scene, camera, meshes);

  // Grouped by placement before allocating, so the whole placement shares one budget.
  const samples = placementSamples(meshes);

  let totalArea = 0;
  const items = meshes.map(({ object, path }, index) => {
    const surface = surfaceEvidence(object);
    totalArea += surface.area;
    void index;
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
    horizon: collectHorizon(meshes, [86, 26, -24]),
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
