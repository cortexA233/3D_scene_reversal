import { NodeIO } from "@gltf-transform/core";
import { KHRDracoMeshCompression } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const DEFAULTS = {
  input: "gt_designer/data/island-village.glb",
  terrain: "gt_designer/data/terrain-heightfield.json",
  overrides: "gt_designer/data/layout-overrides.json",
  wildlife: "gt_designer/data/wildlife.json",
  output: "gt_designer/full-island-layout.generated.js",
};

const WORLD = {
  center: [86, -24],
  coast: [322, 290],
  flat: [255, 228],
  groundY: 26,
  seaY: 16,
  oceanFloor: -40,
};

function parseArguments(args) {
  const options = { ...DEFAULTS, check: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--check") {
      options.check = true;
      continue;
    }
    if (["--input", "--terrain", "--overrides", "--wildlife", "--output"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function projectPath(value) {
  return path.resolve(PROJECT_ROOT, value);
}

function canonicalName(name) {
  return String(name)
    .replace(/[^A-Za-z0-9._]+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "");
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  const result = Math.round(value * scale) / scale;
  return Object.is(result, -0) ? 0 : result;
}

function compactVector(values, digits = 2) {
  return values.map((value) => round(value, digits));
}

function measureNode(node, moved) {
  const mesh = node.getMesh();
  if (!mesh) return null;

  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const point = new THREE.Vector3();
  const transform = new THREE.Matrix4();
  const positions = [];

  if (moved) {
    const localMin = new THREE.Vector3(Infinity, Infinity, Infinity);
    const localMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const primitive of mesh.listPrimitives()) {
      const source = primitive.getAttribute("POSITION")?.getArray();
      if (!source) continue;
      for (let offset = 0; offset < source.length; offset += 3) {
        point.set(source[offset], source[offset + 1], source[offset + 2]);
        localMin.min(point);
        localMax.max(point);
      }
    }
    const center = localMin.add(localMax).multiplyScalar(0.5);
    transform
      .compose(
        new THREE.Vector3(...moved.pos),
        new THREE.Quaternion(...moved.quat),
        new THREE.Vector3(...moved.scale),
      )
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
  } else {
    transform.fromArray(node.getWorldMatrix());
  }

  let sumX = 0;
  let sumZ = 0;
  let vertexCount = 0;
  for (const primitive of mesh.listPrimitives()) {
    const source = primitive.getAttribute("POSITION")?.getArray();
    if (!source) continue;
    for (let offset = 0; offset < source.length; offset += 3) {
      point
        .set(source[offset], source[offset + 1], source[offset + 2])
        .applyMatrix4(transform);
      min.min(point);
      max.max(point);
      sumX += point.x;
      sumZ += point.z;
      positions.push(point.x, point.z);
      vertexCount += 1;
    }
  }
  if (vertexCount === 0) return null;

  const meanX = sumX / vertexCount;
  const meanZ = sumZ / vertexCount;
  let xx = 0;
  let xz = 0;
  let zz = 0;
  for (let index = 0; index < positions.length; index += 2) {
    const x = positions[index] - meanX;
    const z = positions[index + 1] - meanZ;
    xx += x * x;
    xz += x * z;
    zz += z * z;
  }
  const yaw = 0.5 * Math.atan2(2 * xz, xx - zz);
  const center = min.clone().add(max).multiplyScalar(0.5);
  const size = max.clone().sub(min);
  return {
    name: node.getName(),
    canonicalName: canonicalName(node.getName()),
    family: node.getName().split("__")[0],
    min: min.toArray(),
    max: max.toArray(),
    center: center.toArray(),
    bottom: [center.x, min.y, center.z],
    size: size.toArray(),
    yaw,
    vertexCount,
  };
}

function aggregate(measurements, kind) {
  const min = [0, 1, 2].map((axis) =>
    Math.min(...measurements.map((item) => item.min[axis])),
  );
  const max = [0, 1, 2].map((axis) =>
    Math.max(...measurements.map((item) => item.max[axis])),
  );
  const center = min.map((value, axis) => (value + max[axis]) * 0.5);
  const largest = measurements.reduce((best, item) =>
    item.size[0] * item.size[2] > best.size[0] * best.size[2] ? item : best,
  );
  return {
    kind,
    position: compactVector([center[0], min[1], center[2]]),
    size: compactVector(max.map((value, axis) => value - min[axis])),
    yaw: round(largest.yaw, 3),
  };
}

function clusterByDistance(measurements, distance, kind, filter = () => true) {
  const remaining = measurements.filter(filter);
  const clusters = [];
  const consumed = new Set();
  for (let start = 0; start < remaining.length; start += 1) {
    if (consumed.has(start)) continue;
    const cluster = [];
    const queue = [start];
    consumed.add(start);
    while (queue.length) {
      const index = queue.pop();
      const item = remaining[index];
      cluster.push(item);
      for (let candidate = 0; candidate < remaining.length; candidate += 1) {
        if (consumed.has(candidate)) continue;
        const other = remaining[candidate];
        const dx = item.center[0] - other.center[0];
        const dz = item.center[2] - other.center[2];
        if (Math.hypot(dx, dz) <= distance) {
          consumed.add(candidate);
          queue.push(candidate);
        }
      }
    }
    clusters.push(aggregate(cluster, kind));
  }
  return clusters.sort(
    (a, b) => a.position[2] - b.position[2] || a.position[0] - b.position[0],
  );
}

function groupFamily(measurements, expression, kind) {
  const selected = measurements.filter((item) => expression.test(item.family));
  const families = new Map();
  for (const item of selected) {
    const values = families.get(item.family) ?? [];
    values.push(item);
    families.set(item.family, values);
  }
  return [...families.values()]
    .map((items) => aggregate(items, kind))
    .sort((a, b) => a.position[2] - b.position[2] || a.position[0] - b.position[0]);
}

function sampleHeight(heightfield, x, z) {
  const { meta, h } = heightfield;
  const fx = ((x - meta.x0) / (meta.x1 - meta.x0)) * (meta.nx - 1);
  const fz = ((z - meta.z0) / (meta.z1 - meta.z0)) * (meta.nz - 1);
  if (fx < 0 || fz < 0 || fx > meta.nx - 1 || fz > meta.nz - 1) {
    return WORLD.oceanFloor;
  }
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const x1 = Math.min(x0 + 1, meta.nx - 1);
  const z1 = Math.min(z0 + 1, meta.nz - 1);
  const tx = fx - x0;
  const tz = fz - z0;
  const value = (height) => height ?? WORLD.oceanFloor;
  return (
    value(h[z0][x0]) * (1 - tx) * (1 - tz) +
    value(h[z0][x1]) * tx * (1 - tz) +
    value(h[z1][x0]) * (1 - tx) * tz +
    value(h[z1][x1]) * tx * tz
  );
}

function extractCoastline(heightfield, count = 48) {
  const radii = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    let lastLand = 0;
    for (let radius = 0; radius <= 520; radius += 2) {
      const x = WORLD.center[0] + Math.cos(angle) * radius;
      const z = WORLD.center[1] + Math.sin(angle) * radius;
      if (sampleHeight(heightfield, x, z) >= WORLD.seaY - 0.75) lastLand = radius;
    }
    radii.push(round(lastLand, 1));
  }
  return radii;
}

function extractRelief(heightfield, count = 14) {
  const { meta, h } = heightfield;
  const candidates = [];
  for (let zIndex = 2; zIndex < meta.nz - 2; zIndex += 4) {
    for (let xIndex = 2; xIndex < meta.nx - 2; xIndex += 4) {
      const height = h[zIndex][xIndex];
      if (!Number.isFinite(height) || height < WORLD.groundY + 5) continue;
      const x = meta.x0 + (xIndex / (meta.nx - 1)) * (meta.x1 - meta.x0);
      const z = meta.z0 + (zIndex / (meta.nz - 1)) * (meta.z1 - meta.z0);
      candidates.push({ x, z, height });
    }
  }
  candidates.sort((a, b) => b.height - a.height);
  const selected = [];
  for (const candidate of candidates) {
    if (selected.some((item) => Math.hypot(item.x - candidate.x, item.z - candidate.z) < 64)) {
      continue;
    }
    selected.push(candidate);
    if (selected.length === count) break;
  }
  return selected
    .map((item) => ({
      position: compactVector([item.x, item.z]),
      height: round(Math.max(0, item.height - WORLD.groundY), 1),
      radius: 56,
    }))
    .sort((a, b) => a.position[1] - b.position[1] || a.position[0] - b.position[0]);
}

function extractWildlife(wildlife, overrides) {
  const deleted = new Set(overrides.pandaDeleted ?? []);
  return (wildlife.children ?? [])
    .map((model) => {
      const key = `panda_${canonicalName(model.name)}`;
      if (deleted.has(key)) return null;
      const root = (model.children ?? []).find((node) => node.name === "Character Root");
      const matrix = root?.properties?.matrix;
      if (!matrix) return null;
      const delta = overrides.pandaDelta?.[key];
      const position = [matrix[3], matrix[7], matrix[11]];
      if (delta) {
        position[0] += delta.pos[0];
        position[1] += delta.pos[1];
        position[2] += delta.pos[2];
      }
      return {
        kind: "panda",
        position: compactVector(position),
        scale: round(root.properties?.size?.[0] ?? 2, 2),
        yaw: round(Math.atan2(matrix[2], matrix[0]), 3),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.position[2] - b.position[2] || a.position[0] - b.position[0]);
}

function extractSceneLayout(measurements, heightfield, wildlife, overrides) {
  const palms = clusterByDistance(
    measurements,
    18,
    "palm",
    (item) => /^PalmTree/i.test(item.name),
  );
  const blossoms = clusterByDistance(
    measurements,
    12,
    "blossom",
    (item) => /^CherryBlossom/i.test(item.name) && item.size[1] > 8,
  );
  const bamboo = clusterByDistance(
    measurements,
    5,
    "bamboo",
    (item) => /^bamboo_forest/i.test(item.name) && item.size[1] > 7,
  );
  const mountains = measurements
    .filter((item) => /^mesh_m/i.test(item.name) && item.size[1] > 100)
    .map((item) => aggregate([item], "mountain"))
    .sort((a, b) => a.position[2] - b.position[2] || a.position[0] - b.position[0]);
  const structures = [
    ...groupFamily(measurements, /^dessert_shop/i, "dessert-shop"),
    ...groupFamily(measurements, /^Dumpling_house/i, "dumpling-house"),
    ...groupFamily(measurements, /^fruit_shop/i, "fruit-shop"),
    ...groupFamily(measurements, /^ring_booth/i, "ring-booth"),
    ...groupFamily(measurements, /^Shop_02/i, "shop"),
    ...groupFamily(measurements, /^tea_booth/i, "tea-booth"),
    ...groupFamily(measurements, /^pavilion_single_floor/i, "pavilion"),
    ...groupFamily(measurements, /^pavilion_fbx/i, "pavilion-tower"),
    ...groupFamily(measurements, /^Wish_tree/i, "wish-tree"),
    ...groupFamily(measurements, /^Swing_and_tree/i, "swing-tree"),
  ].sort((a, b) => a.position[2] - b.position[2] || a.position[0] - b.position[0]);
  const bridges = measurements
    .filter((item) => /^Mesh_0\.00[12]$/.test(item.name))
    .map((item) => aggregate([item], "bridge"));
  const plazas = measurements
    .filter((item) => /^BrickPlaza/.test(item.name))
    .map((item) => aggregate([item], "plaza"));
  const pathStones = measurements
    .filter((item) =>
      (/^StonePath/i.test(item.name) || /^MeshPart/i.test(item.name)) &&
      item.size[1] < 2 &&
      item.size[0] < 22 &&
      item.size[2] < 22,
    )
    .map((item) => aggregate([item], "path-stone"));
  const rocks = measurements
    .filter((item) => /^Stone__/i.test(item.name))
    .map((item) => aggregate([item], "rock"));
  const decorations = [
    ...measurements.filter((item) => /^Umbrella/i.test(item.name)).map((item) => aggregate([item], "umbrella")),
    ...measurements.filter((item) => /^(lattern|camping_light)/i.test(item.name)).map((item) => aggregate([item], "lantern")),
    ...measurements.filter((item) => /^sm_env_mushroom/i.test(item.name)).map((item) => aggregate([item], "mushroom")),
    ...measurements.filter((item) => /^Grass/i.test(item.name)).map((item) => aggregate([item], "grass-clump")),
    ...measurements.filter((item) => /^Smooth_Block_Model/i.test(item.name)).map((item) => aggregate([item], "stone-platform")),
    ...groupFamily(measurements, /^Campfire/i, "campfire"),
    ...groupFamily(measurements, /^Stone_table/i, "stone-table"),
    ...groupFamily(measurements, /^Willow/i, "willow"),
    ...groupFamily(measurements, /^bamboo_pile/i, "bamboo-pile"),
    ...groupFamily(measurements, /^Bamboo_shoot/i, "bamboo-shoot"),
    ...groupFamily(measurements, /^Panda_statue/i, "panda-statue"),
    ...groupFamily(measurements, /^flower_fbx/i, "flower-bed"),
  ].sort((a, b) => a.position[2] - b.position[2] || a.position[0] - b.position[0]);

  return {
    schemaVersion: "full-island-semantic-layout-v1",
    world: WORLD,
    terrain: {
      coastlineRadii: extractCoastline(heightfield),
      relief: extractRelief(heightfield),
    },
    mountains,
    structures,
    bridges,
    plazas,
    pathStones,
    rocks,
    decorations,
    palms,
    blossoms,
    bamboo,
    wildlife: extractWildlife(wildlife, overrides),
  };
}

function serialize(layout) {
  return `// GENERATED FILE — compact Semantic Measurements only.\n// Regenerate with: npm run extract:full-island-layout\n// Authored meshes, vertices, textures, source-node IDs and dense height samples are not retained.\n\nexport const REFERENCE_LAYOUT = Object.freeze(${JSON.stringify(layout, null, 2)});\n`;
}

export async function buildFullIslandLayout(options = {}) {
  const paths = {
    input: projectPath(options.input ?? DEFAULTS.input),
    terrain: projectPath(options.terrain ?? DEFAULTS.terrain),
    overrides: projectPath(options.overrides ?? DEFAULTS.overrides),
    wildlife: projectPath(options.wildlife ?? DEFAULTS.wildlife),
    output: projectPath(options.output ?? DEFAULTS.output),
  };
  const [heightfield, overrides, wildlife] = await Promise.all([
    readFile(paths.terrain, "utf8").then(JSON.parse),
    readFile(paths.overrides, "utf8").then(JSON.parse),
    readFile(paths.wildlife, "utf8").then(JSON.parse),
  ]);
  const decoder = await draco3d.createDecoderModule();
  const document = await new NodeIO()
    .registerExtensions([KHRDracoMeshCompression])
    .registerDependencies({ "draco3d.decoder": decoder })
    .read(paths.input);
  const deleted = new Set(overrides.deleted ?? []);
  const measurements = document
    .getRoot()
    .listNodes()
    .filter((node) => node.getMesh())
    .filter((node) => !deleted.has(canonicalName(node.getName())))
    .filter((node) => !/^(_1|1|Cube)$/.test(node.getName()))
    .map((node) => measureNode(node, overrides.moved?.[canonicalName(node.getName())]))
    .filter(Boolean);
  return {
    layout: extractSceneLayout(measurements, heightfield, wildlife, overrides),
    output: paths.output,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const { layout, output } = await buildFullIslandLayout(options);
  const serialized = serialize(layout);
  if (options.check) {
    const existing = await readFile(output, "utf8");
    if (existing !== serialized) {
      throw new Error(`${path.relative(PROJECT_ROOT, output)} is stale; regenerate it.`);
    }
  } else {
    await writeFile(output, serialized);
  }
  const counts = Object.fromEntries(
    ["mountains", "structures", "bridges", "plazas", "pathStones", "rocks", "decorations", "palms", "blossoms", "bamboo", "wildlife"]
      .map((key) => [key, layout[key].length]),
  );
  console.log(`${options.check ? "Verified" : "Wrote"} ${path.relative(PROJECT_ROOT, output)}`);
  console.log(JSON.stringify(counts));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
