import * as THREE from "three";

import { createSeededRng } from "../core/rng.js";

/**
 * Local Object Generators for scene entity kinds.
 *
 * Every generator works only in its own Reconstruction Frame: it returns a form
 * whose complete AABB bottom-center is the origin, and it never reads world
 * placement, neighbouring entities, the camera, or island coordinates. The Scene
 * Generator is the sole owner of where the result goes.
 *
 * Shapes here are semantic skeletons for the generation seam. Silhouette parity
 * is the reconstruction milestone's work; what this module fixes is the
 * contract: local frame, exact Target AABB Extent, stable semantic parts.
 */

const UNIT = Object.freeze({ width: 1, height: 1, depth: 1 });

function part(object, id) {
  object.userData.semanticPart = id;
  return object;
}

function group(parts) {
  const root = new THREE.Group();
  for (const child of parts) root.add(child);
  return root;
}

function box(width, height, depth, y = height / 2, x = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth));
  mesh.position.set(x, y, z);
  return mesh;
}

function cylinder(radiusTop, radiusBottom, height, radialSegments, y = height / 2) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
  );
  mesh.position.y = y;
  return mesh;
}

function cone(radius, height, radialSegments, y = height / 2) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, radialSegments));
  mesh.position.y = y;
  return mesh;
}

function sphere(radius, widthSegments, heightSegments, y = radius) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, widthSegments, heightSegments),
  );
  mesh.position.y = y;
  return mesh;
}

/**
 * A bounded support-plane solid: the accepted compact Stone representation,
 * reused here for rocks and distant ridges so the horizon is not a scaled
 * primitive.
 */
function supportSolid(rng, { rings = 3, sides = 8, roughness = 0.22 } = {}) {
  const positions = [];
  const rows = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const v = ring / rings;
    const polar = v * Math.PI;
    const row = [];
    for (let side = 0; side < sides; side += 1) {
      const azimuth = (side / sides) * Math.PI * 2;
      const support = 1 - roughness * 0.5 + rng.nextFloat() * roughness;
      row.push(
        new THREE.Vector3(
          Math.sin(polar) * Math.cos(azimuth) * support,
          Math.cos(polar) * support,
          Math.sin(polar) * Math.sin(azimuth) * support,
        ),
      );
    }
    rows.push(row);
  }
  for (let ring = 0; ring < rings; ring += 1) {
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      const a = rows[ring][side];
      const b = rows[ring][next];
      const c = rows[ring + 1][next];
      const d = rows[ring + 1][side];
      positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry);
}

/** Architecture family: platform, body, and a flared roof. */
function architecture(rng, { levels = 1, eaves = 1.18, platform = 0.1 } = {}) {
  const parts = [part(box(0.92, platform, 0.92, platform / 2), "platform")];
  const bodyHeight = (1 - platform) * 0.62;
  const levelHeight = bodyHeight / levels;
  for (let level = 0; level < levels; level += 1) {
    const taper = 1 - level * 0.12;
    parts.push(
      part(
        box(
          0.7 * taper,
          levelHeight,
          0.7 * taper,
          platform + levelHeight * (level + 0.5),
        ),
        `body-${level}`,
      ),
    );
  }
  const roofHeight = 1 - platform - bodyHeight;
  const roof = part(
    cone(0.5 * eaves, roofHeight, 4, platform + bodyHeight + roofHeight / 2),
    "roof",
  );
  roof.rotation.y = Math.PI / 4;
  parts.push(roof);
  if (rng.nextFloat() > 0.5) {
    parts.push(part(box(0.06, bodyHeight * 0.9, 0.06, platform + bodyHeight * 0.45, 0.34, 0.34), "post"));
  }
  return group(parts);
}

function bridge(rng) {
  const deck = part(box(1, 0.12, 0.7, 0.62), "deck");
  const parts = [deck];
  for (const side of [-1, 1]) {
    parts.push(part(box(1, 0.22, 0.05, 0.79, 0, side * 0.34), `railing-${side > 0 ? "north" : "south"}`));
  }
  for (const end of [-1, 1]) {
    parts.push(part(box(0.14, 0.56, 0.7, 0.28, end * 0.42), `abutment-${end > 0 ? "east" : "west"}`));
  }
  const arch = part(cylinder(0.34, 0.34, 0.66, 12, 0.4), "arch");
  arch.rotation.z = Math.PI / 2;
  arch.scale.set(1, 1, 0.5);
  parts.push(arch);
  return group(parts);
}

function plaza() {
  return group([
    part(box(1, 0.7, 1, 0.35), "paving"),
    part(box(0.88, 0.3, 0.88, 0.85), "inlay"),
  ]);
}

/** Shallow irregular slab: the accepted Stone Path footprint extrusion idea. */
function slab(rng, { sides = 7 } = {}) {
  const shape = new THREE.Shape();
  for (let index = 0; index < sides; index += 1) {
    const angle = (index / sides) * Math.PI * 2;
    const radius = 0.38 + rng.nextFloat() * 0.12;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (index === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    bevelEnabled: false,
  });
  geometry.rotateX(-Math.PI / 2);
  return group([part(new THREE.Mesh(geometry), "slab")]);
}

/**
 * Multi-form horizon ridge.
 *
 * Peaks and foothills come from the Horizon Group's own bounded controls, so
 * the skyline is an authored multi-form ridge rather than a scaled Stone or a
 * random cone population. A saddle is the generated gap between two adjacent
 * peaks, which is why the peaks are placed rather than distributed.
 */
function horizonGroup(rng, shape) {
  const peaks = shape?.peaks?.length ? shape.peaks : [{ offset: [0, 0], height: 1 }];
  const foothills = shape?.foothills ?? [];
  const parts = [];

  // One compact per-group control for how broad its summits sit inside the
  // group's footprint. Fitted from the reference's own measured skyline.
  const spreadScale = shape?.spreadScale ?? 1;
  peaks.forEach((peak, index) => {
    const solid = supportSolid(rng, { rings: 4, sides: 9, roughness: 0.34 });
    // A peak's footprint scales with its prominence so a dominant summit reads
    // as a massif and a secondary one as a shoulder.
    const spread = (0.22 + peak.height * 0.26) * spreadScale;
    solid.scale.set(spread, peak.height / 2, spread * 0.86);
    solid.position.set(peak.offset[0], peak.height / 2, peak.offset[1]);
    parts.push(part(solid, `peak-${index}`));
  });
  foothills.forEach((foothill, index) => {
    const solid = supportSolid(rng, { rings: 3, sides: 7, roughness: 0.46 });
    const spread = (0.16 + foothill.height * 0.2) * spreadScale;
    solid.scale.set(spread, foothill.height / 2, spread * 0.8);
    solid.position.set(foothill.offset[0], foothill.height / 2, foothill.offset[1]);
    parts.push(part(solid, `foothill-${index}`));
  });
  // A single-summit group still needs a saddle-forming shoulder so its
  // silhouette is not one symmetric dome.
  if (peaks.length === 1 && foothills.length === 0) {
    const solid = supportSolid(rng, { rings: 3, sides: 7, roughness: 0.5 });
    const height = 0.45 + rng.nextFloat() * 0.2;
    solid.scale.set(0.24, height / 2, 0.2);
    solid.position.set(0.3, height / 2, -0.12);
    parts.push(part(solid, "shoulder"));
  }
  return group(parts);
}

function palm(rng) {
  const parts = [];
  const trunkHeight = 0.72;
  const trunk = part(cylinder(0.026, 0.05, trunkHeight, 7, trunkHeight / 2), "trunk");
  trunk.rotation.z = (rng.nextFloat() - 0.5) * 0.12;
  parts.push(trunk);
  const fronds = 7 + Math.floor(rng.nextFloat() * 3);
  for (let index = 0; index < fronds; index += 1) {
    const azimuth = (index / fronds) * Math.PI * 2 + rng.nextFloat() * 0.2;
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.2, 3, 1));
    frond.position.set(
      Math.cos(azimuth) * 0.24,
      trunkHeight + 0.1,
      Math.sin(azimuth) * 0.24,
    );
    frond.rotation.set(-0.5 - rng.nextFloat() * 0.3, -azimuth, 0);
    parts.push(part(frond, `frond-${index}`));
  }
  return group(parts);
}

function blossom(rng) {
  const parts = [part(cylinder(0.035, 0.06, 0.44, 7, 0.22), "trunk")];
  const lobes = 4 + Math.floor(rng.nextFloat() * 3);
  for (let index = 0; index < lobes; index += 1) {
    const azimuth = (index / lobes) * Math.PI * 2;
    const lobe = sphere(0.24 + rng.nextFloat() * 0.08, 8, 6, 0.7);
    lobe.position.x = Math.cos(azimuth) * 0.2;
    lobe.position.z = Math.sin(azimuth) * 0.2;
    parts.push(part(lobe, `canopy-${index}`));
  }
  return group(parts);
}

function bambooClump(rng) {
  const parts = [];
  const culms = 3 + Math.floor(rng.nextFloat() * 4);
  for (let index = 0; index < culms; index += 1) {
    const height = 0.7 + rng.nextFloat() * 0.3;
    const culm = part(cylinder(0.03, 0.04, height, 6, height / 2), `culm-${index}`);
    culm.position.set(
      (rng.nextFloat() - 0.5) * 0.5,
      height / 2,
      (rng.nextFloat() - 0.5) * 0.5,
    );
    culm.rotation.z = (rng.nextFloat() - 0.5) * 0.16;
    parts.push(culm);
  }
  return group(parts);
}

function lantern() {
  return group([
    part(box(0.16, 0.62, 0.16, 0.31), "post"),
    part(box(0.44, 0.3, 0.44, 0.78), "housing"),
    part(cone(0.34, 0.14, 4, 0.96), "cap"),
  ]);
}

function creature(rng) {
  const parts = [
    part(sphere(0.3, 10, 8, 0.42), "body"),
    part(sphere(0.22, 10, 8, 0.76), "head"),
  ];
  for (const [x, z, id] of [
    [-0.18, 0.16, "leg-front-left"],
    [0.18, 0.16, "leg-front-right"],
    [-0.18, -0.16, "leg-back-left"],
    [0.18, -0.16, "leg-back-right"],
  ]) {
    parts.push(part(cylinder(0.08, 0.08, 0.24, 6, 0.12), id));
    parts.at(-1).position.set(x, 0.12, z);
  }
  if (rng.nextFloat() > 0.5) parts.push(part(sphere(0.07, 6, 5, 0.92), "ear"));
  return group(parts);
}

function mound(rng, { sides = 8 } = {}) {
  const solid = supportSolid(rng, { rings: 3, sides, roughness: 0.34 });
  solid.scale.setScalar(0.5);
  solid.position.y = 0.5;
  return group([part(solid, "mass")]);
}

function post(rng, { headWidth = 0.5, headHeight = 0.3 } = {}) {
  return group([
    part(box(0.16, 0.62, 0.16, 0.31), "post"),
    part(box(headWidth, headHeight, headWidth, 0.62 + headHeight / 2), "head"),
    part(cone(headWidth * 0.78, 0.12, 4, 0.62 + headHeight + 0.06), "cap"),
  ]);
}

function panel(rng, { thickness = 0.12 } = {}) {
  return group([
    part(box(thickness, 1, 1, 0.5), "face"),
    part(box(thickness * 1.6, 0.08, 1.06, 0.96), "frame-top"),
    part(box(thickness * 1.6, 0.08, 1.06, 0.04), "frame-bottom"),
  ]);
}

function vessel(rng, { neck = 0.45, belly = 0.5 } = {}) {
  return group([
    part(cylinder(belly * 0.6, belly * 0.5, 0.12, 12, 0.06), "foot"),
    part(sphere(belly, 12, 8, 0.5), "belly"),
    part(cylinder(neck * 0.5, neck * 0.62, 0.3, 12, 0.85), "neck"),
  ]);
}

function pile(rng, { pieces = 5 } = {}) {
  const parts = [];
  for (let index = 0; index < pieces; index += 1) {
    const log = part(cylinder(0.16, 0.16, 0.9, 8, 0), `piece-${index}`);
    log.rotation.z = Math.PI / 2 + (rng.nextFloat() - 0.5) * 0.4;
    log.position.set(
      (rng.nextFloat() - 0.5) * 0.3,
      0.16 + Math.floor(index / 2) * 0.28,
      (index % 2) * 0.3 - 0.15,
    );
    parts.push(log);
  }
  return group(parts);
}

function figure(rng) {
  return group([
    part(cylinder(0.22, 0.3, 0.55, 10, 0.275), "robe"),
    part(sphere(0.2, 10, 8, 0.75), "head"),
    part(box(0.62, 0.1, 0.18, 0.6), "arms"),
    part(cylinder(0.34, 0.34, 0.08, 12, 0.04), "base"),
  ]);
}

const GENERATORS = Object.freeze({
  mountain: horizonGroup,

  // Architecture
  pavilion: (rng) => architecture(rng, { levels: 2 }),
  "pavilion-single": (rng) => architecture(rng, { levels: 1, eaves: 1.24 }),
  "pavilion-tower": (rng) => architecture(rng, { levels: 3, eaves: 1.1 }),
  "ring-booth": (rng) => architecture(rng, { levels: 1, eaves: 1.3 }),
  shop: (rng) => architecture(rng, { levels: 1 }),
  "shop-stall": (rng) => architecture(rng, { levels: 1, eaves: 1.34, platform: 0.06 }),
  "dumpling-house": (rng) => architecture(rng, { levels: 1 }),
  "fruit-shop": (rng) => architecture(rng, { levels: 1 }),
  "tea-booth": (rng) => architecture(rng, { levels: 1, eaves: 1.26 }),
  "dessert-shop": (rng) => architecture(rng, { levels: 1 }),
  "swing-tree": blossom,
  "wish-tree": blossom,
  willow: blossom,
  bridge,

  // Ground surfaces
  plaza,
  deck: (rng) => slab(rng, { sides: 5 }),
  "path-stone": slab,
  "paving-slab": (rng) => slab(rng, { sides: 6 }),
  "stone-platform": (rng) => slab(rng, { sides: 6 }),

  // Rock
  rock: mound,
  "stone-block": () => group([part(box(0.9, 1, 0.9, 0.5), "block")]),

  // Decoration and props
  lantern,
  "camp-light": (rng) => post(rng, { headWidth: 0.42, headHeight: 0.26 }),
  campfire: (rng) => mound(rng, { sides: 6 }),
  umbrella: (rng) => architecture(rng, { levels: 1, eaves: 1.6, platform: 0.04 }),
  "log-pile": pile,
  "bamboo-pile": (rng) => pile(rng, { pieces: 7 }),
  "shop-sign": panel,
  "name-plate": (rng) => panel(rng, { thickness: 0.18 }),
  "yin-yang": () => group([
    part(cylinder(0.5, 0.5, 0.6, 24, 0.3), "disc"),
    part(cylinder(0.24, 0.24, 0.66, 16, 0.33), "eye"),
  ]),
  "stone-table": () => group([
    part(cylinder(0.14, 0.18, 0.62, 8, 0.31), "pedestal"),
    part(cylinder(0.5, 0.5, 0.16, 12, 0.7), "top"),
  ]),
  vase: (rng) => vessel(rng),
  potion: (rng) => vessel(rng, { neck: 0.3, belly: 0.38 }),
  candle: () => group([
    part(cylinder(0.3, 0.34, 0.78, 12, 0.39), "body"),
    part(cone(0.1, 0.22, 8, 0.89), "flame"),
  ]),
  "blue-hat": () => group([
    part(cylinder(0.5, 0.5, 0.24, 16, 0.12), "brim"),
    part(sphere(0.34, 12, 8, 0.4), "crown"),
  ]),
  "lucky-bag": (rng) => group([
    part(sphere(0.44, 12, 8, 0.44), "body"),
    part(cylinder(0.16, 0.24, 0.3, 10, 0.85), "neck"),
  ]),
  ganlu: (rng) => vessel(rng, { neck: 0.26, belly: 0.34 }),
  "flower-bed": (rng) => slab(rng, { sides: 8 }),
  mushroom: () => group([
    part(cylinder(0.1, 0.14, 0.5, 8, 0.25), "stem"),
    part(sphere(0.4, 10, 6, 0.62), "cap"),
  ]),
  "bamboo-shoot": () => group([part(cone(0.4, 1, 8, 0.5), "shoot")]),

  // Characters
  "npc-statue": figure,
  "panda-statue": creature,
  panda: creature,

  // Vegetation
  palm,
  blossom,
  bamboo: bambooClump,
  "grass-clump": (rng) => bambooClump(rng),
});

export function listSceneGeneratorKinds() {
  return Object.keys(GENERATORS);
}

export function hasSceneGeneratorKind(kind) {
  return Object.hasOwn(GENERATORS, kind);
}

/**
 * Build one entity in its Reconstruction Frame: the complete generated AABB
 * bottom-center sits at the origin. Target AABB Extent, orientation, and world
 * placement all belong to the Scene Generator, so nothing here can absorb a
 * layout error into a hidden local correction.
 *
 * @param {string} kind
 * @param {number} seed unsigned 32-bit derived geometry seed
 * @param {object} [shape] the entity's compact local shape controls
 */
export function generateSceneObject(kind, seed, shape) {
  const generator = GENERATORS[kind];
  if (!generator) throw new Error(`Unknown scene generator kind: ${kind}`);

  const local = generator(createSeededRng(seed), shape ?? UNIT);
  if (!local?.isObject3D) {
    throw new TypeError(`${kind} generator must return one THREE.Object3D root`);
  }
  local.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(local);
  const size = bounds.getSize(new THREE.Vector3());
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
    throw new RangeError(`${kind} generator produced a degenerate local form`);
  }

  const center = bounds.getCenter(new THREE.Vector3());
  const frame = new THREE.Group();
  local.position.set(-center.x, -bounds.min.y, -center.z);
  frame.add(local);
  frame.userData.localSize = [size.x, size.y, size.z];
  return frame;
}
