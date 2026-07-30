import * as THREE from "three";

import { createSeededRng } from "../core/rng.js";
import { deriveSceneSeed } from "./scene-seed.js";

/**
 * Terrain generation.
 *
 * Tessellation is a general generator concern and is chosen here, independently
 * of the recipe's shape semantics: the recipe says what the island *is*, this
 * module decides how finely to evaluate it. Elevation is computed analytically
 * at every vertex; the recipe retains no grid, per-vertex height, or distance
 * field.
 *
 * The current program is `measured-radial-coast-v1`, which Foundation ticket 06
 * replaces with the Bounded Semantic Terrain Program.
 */

const TESSELLATION = 192;

function valueNoise(rng, size) {
  const values = new Float32Array(size * size);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = rng.nextFloat();
  }
  return (x, z) => {
    const fx = ((x % size) + size) % size;
    const fz = ((z % size) + size) % size;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = (x0 + 1) % size;
    const z1 = (z0 + 1) % size;
    const tx = fx - x0;
    const tz = fz - z0;
    const sx = tx * tx * (3 - 2 * tx);
    const sz = tz * tz * (3 - 2 * tz);
    const a = values[z0 * size + x0];
    const b = values[z0 * size + x1];
    const c = values[z1 * size + x0];
    const d = values[z1 * size + x1];
    return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
  };
}

function coastRadiusSampler(radii) {
  return (angle) => {
    const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const scaled = (normalized / (Math.PI * 2)) * radii.length;
    const index = Math.floor(scaled);
    const next = (index + 1) % radii.length;
    const t = scaled - index;
    const smooth = t * t * (3 - 2 * t);
    return radii[index] * (1 - smooth) + radii[next] * smooth;
  };
}

export function createTerrainElevationField(recipe) {
  const { terrain, world } = recipe;
  const noiseRng = createSeededRng(
    deriveSceneSeed(recipe.sceneSeed, "geography/terrain", "geometry"),
  );
  const noise = valueNoise(noiseRng, 64);
  const coastRadius = coastRadiusSampler(terrain.coastlineRadii);
  const [cx, cz] = terrain.center;

  return function heightAt(x, z) {
    const dx = x - cx;
    const dz = z - cz;
    const distance = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);
    const shore = coastRadius(angle);
    const normalized = distance / shore;

    // Coast falloff: interior plateau, shore shelf, then ocean floor.
    let height;
    if (normalized <= 0.72) {
      height = world.groundY;
    } else if (normalized <= 1) {
      const t = (normalized - 0.72) / 0.28;
      height = world.groundY + (world.semanticSeaLevel - 4 - world.groundY) * (t * t);
    } else {
      const t = Math.min(1, (normalized - 1) / 0.45);
      height =
        world.semanticSeaLevel - 4 + (world.oceanFloor - (world.semanticSeaLevel - 4)) * t;
    }

    // Named analytic landforms.
    for (const relief of terrain.relief) {
      const rdx = x - relief.position[0];
      const rdz = z - relief.position[1];
      const falloff = Math.exp(
        -(rdx * rdx + rdz * rdz) / (2 * relief.radius * relief.radius * 0.36),
      );
      height += relief.height * falloff;
    }

    if (normalized <= 1.05) {
      const detail =
        (noise(x * 0.035, z * 0.035) - 0.5) * 6 +
        (noise(x * 0.11, z * 0.11) - 0.5) * 2.2;
      height += detail * Math.min(1, Math.max(0, 1.2 - normalized));
    }
    return height;
  };
}

export function generateTerrain(recipe, materials) {
  const { world } = recipe;
  const heightAt = createTerrainElevationField(recipe);
  const spanX = world.coastExtent[0] * 2.6;
  const spanZ = world.coastExtent[1] * 2.6;
  const geometry = new THREE.PlaneGeometry(spanX, spanZ, TESSELLATION, TESSELLATION);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const sand = new THREE.Color(0.83, 0.74, 0.53);
  const grass = new THREE.Color(0.36, 0.52, 0.27);
  const rock = new THREE.Color(0.46, 0.45, 0.42);
  const seabed = new THREE.Color(0.28, 0.36, 0.35);
  const color = new THREE.Color();

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index) + world.center[0];
    const z = position.getZ(index) + world.center[1];
    const height = heightAt(x, z);
    position.setX(index, x);
    position.setZ(index, z);
    position.setY(index, height);

    if (height < world.semanticSeaLevel - 2) color.copy(seabed);
    else if (height < world.semanticSeaLevel + 3) color.copy(sand);
    else if (height > world.groundY + 26) color.copy(rock);
    else color.copy(grass);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, materials.terrain("terrain-ground"));
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.semanticId = "geography/terrain";
  mesh.userData.terrainProgram = recipe.terrain.program;
  mesh.userData.tessellation = TESSELLATION;
  return mesh;
}
