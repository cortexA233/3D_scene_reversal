import * as THREE from "three";

import {
  createCoastlineCurve,
  createTerrainProgramField,
} from "./terrain-program.js";

/**
 * Terrain generation.
 *
 * Tessellation is a general generator concern and is chosen here, independently
 * of the recipe's shape semantics: the recipe says what the island *is*, this
 * module decides how finely to evaluate it. Every vertex elevation is computed
 * analytically from the Bounded Semantic Terrain Program, so changing the
 * tessellation changes the mesh density and nothing about the island's shape.
 */

const TESSELLATION = 256;

/** Land, shore, and sea classification against the Semantic Sea Level. */
export function classifyElevation(height, seaLevel) {
  if (height < seaLevel - 2) return "sea";
  if (height <= seaLevel + 3) return "shore";
  return "land";
}

export function generateTerrain(recipe, materials) {
  const { world, terrain } = recipe;
  const elevationAt = createTerrainProgramField(terrain);
  const radiusAt = createCoastlineCurve(terrain.coastline.nodes);
  const [cx, cz] = terrain.coastline.center;

  // The generated surface must reach past the outermost shoreline control so
  // the coast is never clipped by the mesh boundary.
  const reach =
    Math.max(...terrain.coastline.nodes.map((node) => node.radius)) *
    (1 + terrain.shore.shelfDrop) *
    1.35;
  const geometry = new THREE.PlaneGeometry(reach * 2, reach * 2, TESSELLATION, TESSELLATION);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const sand = new THREE.Color(0.83, 0.74, 0.53);
  const grass = new THREE.Color(0.36, 0.52, 0.27);
  const rock = new THREE.Color(0.46, 0.45, 0.42);
  const seabed = new THREE.Color(0.28, 0.36, 0.35);
  const color = new THREE.Color();

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index) + cx;
    const z = position.getZ(index) + cz;
    const height = elevationAt(x, z);
    position.setX(index, x);
    position.setZ(index, z);
    position.setY(index, height);

    const zone = classifyElevation(height, world.semanticSeaLevel);
    if (zone === "sea") color.copy(seabed);
    else if (zone === "shore") color.copy(sand);
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
  mesh.userData.terrainProgram = terrain.version;
  mesh.userData.tessellation = TESSELLATION;
  mesh.userData.elevationAt = elevationAt;
  mesh.userData.coastRadiusAt = radiusAt;
  return mesh;
}
