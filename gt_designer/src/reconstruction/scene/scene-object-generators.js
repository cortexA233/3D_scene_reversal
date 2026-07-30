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

/**
 * Merges a set of local meshes into one geometry under a single semantic part.
 *
 * A canopy is one semantic thing made of many blades. Emitting a mesh per blade
 * would multiply draw calls by two orders of magnitude and would also claim far
 * more semantic parts than the authored object has. Merging keeps the form and
 * the accounting honest.
 */
function mergeParts(meshes, id) {
  const positions = [];
  const normals = [];
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();

  for (const mesh of meshes) {
    mesh.updateMatrix();
    normalMatrix.getNormalMatrix(mesh.matrix);
    const geometry = mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry;
    const position = geometry.attributes.position;
    const sourceNormal = geometry.attributes.normal;
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index).applyMatrix4(mesh.matrix);
      positions.push(vertex.x, vertex.y, vertex.z);
      if (sourceNormal) {
        normal.fromBufferAttribute(sourceNormal, index).applyMatrix3(normalMatrix).normalize();
        normals.push(normal.x, normal.y, normal.z);
      }
    }
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(positions), 3),
  );
  if (normals.length === positions.length) {
    merged.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));
  } else {
    merged.computeVertexNormals();
  }
  return part(new THREE.Mesh(merged), id);
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

/** How high a ridge's foot stands, as a fraction of its own crest height. */
const APRON_RISE = 0.06;

/**
 * A swept crest ridge: the landform behind a Horizon Group's skyline.
 *
 * Two measurements shaped this. First, the half-buried spheres it replaces have
 * their widest point at their own equator, so a group built from them stood near
 * summit height at nearly every azimuth it covered and the measured skyline read
 * 2.65 degrees too high in 624 of the 720 bins. Second, an authored group's
 * profile is one continuous massif with sub-summits and shallow saddles, never a
 * row of separated mounds, so a union of round domes spends its budget filling
 * the notches between them. Sweeping one crest through the measured summits gets
 * both: the flanks fall away as `(1 - s^2)^falloff` across the ridge, and the
 * skyline between two summits is the crest rather than a gap.
 *
 * Roughness perturbs the ridge's width and never its crest height: a rocky
 * outline keeps the form off a lathe without putting noise into the elevation
 * the skyline is measured by.
 */
function crestRidge(
  rng,
  { nodes, falloff, saddleDepth, runOut, apron, axis, roughness, spans = 6, sides = 10 },
) {
  // Zero-height nodes past each end, so the ridge runs out into its own
  // footprint instead of ending in a cliff. It runs out along the group's own
  // crest direction rather than along its last segment, which is what makes that
  // direction a control the whole ridge answers to instead of only the order its
  // summits are threaded in. How far it runs is the second fitted control: an
  // authored group reaches well beyond its outermost summit.
  const beyond = (from, sign) => ({
    offset: [
      from.offset[0] + axis[0] * sign * from.width * runOut,
      from.offset[1] + axis[1] * sign * from.width * runOut,
    ],
    height: 0,
    width: from.width * 0.6,
  });
  const path = [beyond(nodes[0], -1), ...nodes, beyond(nodes.at(-1), 1)];

  // Sample the crest, sagging between nodes by the saddle control: zero holds a
  // straight interpolation and one takes the saddle all the way to the ground.
  const crest = [];
  for (let segment = 0; segment + 1 < path.length; segment += 1) {
    const from = path[segment];
    const to = path[segment + 1];
    const steps = segment + 2 === path.length ? spans : spans - 1;
    for (let step = 0; step <= steps; step += 1) {
      const along = step / spans;
      const sag = saddleDepth * Math.min(from.height, to.height) * Math.sin(Math.PI * along);
      crest.push({
        x: from.offset[0] + (to.offset[0] - from.offset[0]) * along,
        z: from.offset[1] + (to.offset[1] - from.offset[1]) * along,
        height: Math.max(0, from.height + (to.height - from.height) * along - sag),
        width: from.width + (to.width - from.width) * along,
      });
    }
  }

  const rows = crest.map((here, index) => {
    const back = crest[Math.max(0, index - 1)];
    const ahead = crest[Math.min(crest.length - 1, index + 1)];
    const tangentX = ahead.x - back.x;
    const tangentZ = ahead.z - back.z;
    const length = Math.hypot(tangentX, tangentZ) || 1;
    const acrossX = -tangentZ / length;
    const acrossZ = tangentX / length;
    const row = [];
    for (let side = 0; side <= sides; side += 1) {
      const s = (side / sides) * 2 - 1;
      const support = 1 - roughness * 0.5 + rng.nextFloat() * roughness;
      const reach = s * here.width * (1 + apron) * support;
      // Distance across the section in crest half-widths: 1 is the crest's own
      // edge, and anything past it is the foot the ridge stands on.
      const spanned = Math.abs(s) * (1 + apron);
      const flank = spanned <= 1 ? here.height * (1 - spanned * spanned) ** falloff : 0;
      const foot =
        apron <= 0
          ? 0
          : here.height *
            APRON_RISE *
            (spanned <= 1 ? 1 : Math.max(0, 1 - (spanned - 1) / apron));
      row.push(
        new THREE.Vector3(
          here.x + acrossX * reach,
          Math.max(flank, foot),
          here.z + acrossZ * reach,
        ),
      );
    }
    return row;
  });

  const positions = [];
  for (let index = 0; index + 1 < rows.length; index += 1) {
    for (let side = 0; side < sides; side += 1) {
      const a = rows[index][side];
      const b = rows[index][side + 1];
      const c = rows[index + 1][side + 1];
      const d = rows[index + 1][side];
      positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    // Close the underside. Both flanks already reach zero, so the bottom is the
    // ribbon between them and the ridge is a solid rather than a shell seen
    // through from the seaward cameras.
    const leftHere = rows[index][0];
    const rightHere = rows[index][sides];
    const leftNext = rows[index + 1][0];
    const rightNext = rows[index + 1][sides];
    positions.push(...leftHere, ...leftNext, ...rightNext, ...leftHere, ...rightNext, ...rightHere);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry);
}

/**
 * Multi-form horizon ridge.
 *
 * Peaks and foothills come from the Horizon Group's own bounded controls, so the
 * skyline is an authored multi-form ridge rather than a scaled Stone or a random
 * cone population. They are the crest's nodes, ordered along the group's own
 * fitted ridge direction, so the group is one landform rather than a scatter of
 * mounds — which is what the measured profiles are.
 */
function horizonGroup(rng, shape) {
  const peaks = shape?.peaks?.length ? shape.peaks : [{ offset: [0, 0], height: 1 }];
  const foothills = shape?.foothills ?? [];

  // The group's compact fitted controls: which way its crest runs, how far it
  // runs out past its end summits, how broad it is, how steeply its flanks fall,
  // how deeply it dips between its summits, and how far the foot it stands on
  // reaches past the crest. None of them moves a summit — where the summits are
  // is measured, not fitted.
  const direction = shape?.ridgeDirection ?? 0;
  const runOut = Math.max(1, shape?.ridgeElongation ?? 1);
  const spreadScale = shape?.spreadScale ?? 1;
  const falloff = shape?.flankFalloff ?? 0.5;
  const saddleDepth = shape?.saddleDepth ?? 0;
  const apron = Math.max(0, shape?.ridgeApron ?? 0);
  const turn = Math.cos(direction);
  const tilt = Math.sin(direction);

  const nodes = [...peaks, ...foothills]
    .map((form) => ({
      along: form.offset[0] * turn + form.offset[1] * tilt,
      offset: [...form.offset],
      height: form.height,
      // A summit's breadth is its own fitted control when the loop found one,
      // and its prominence otherwise: a dominant summit reads as a massif and a
      // secondary one as a shoulder, though an authored ridge is not obliged to
      // agree with that rule.
      width: (form.radius ?? 0.09 + form.height * 0.07) * spreadScale,
    }))
    .sort((left, right) => left.along - right.along);

  return group([
    part(
      crestRidge(rng, {
        nodes,
        falloff,
        saddleDepth,
        runOut,
        apron,
        axis: [turn, tilt],
        roughness: 0.16,
      }),
      "ridge",
    ),
  ]);
}

/**
 * A curved tapered ribbon: the shared blade form behind a palm frond and a
 * bamboo leaf. It follows an arc and narrows along its length, so a canopy
 * reads as foliage rather than as a fan of flat cards.
 */
function bladeGeometry({ length, width, droop, segments = 6, curl = 0.35 }) {
  const positions = [];
  const normals = [];
  const point = (t, side) => {
    const bend = droop * t * t;
    const halfWidth = (width / 2) * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.7;
    // Curl lifts the blade's edges, which is what gives a frond its section.
    const lift = curl * halfWidth * (1 - t * 0.4);
    return [t * length, -bend + Math.abs(side) * lift, side * halfWidth];
  };
  for (let segment = 0; segment < segments; segment += 1) {
    const t0 = segment / segments;
    const t1 = (segment + 1) / segments;
    for (const [a, b, c] of [
      [point(t0, -1), point(t0, 0), point(t1, 0)],
      [point(t0, -1), point(t1, 0), point(t1, -1)],
      [point(t0, 0), point(t0, 1), point(t1, 1)],
      [point(t0, 0), point(t1, 1), point(t1, 0)],
    ]) {
      positions.push(...a, ...b, ...c);
      normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** A leaning tapered trunk built from a short chain of segments. */
function trunkColumn(rng, { height, baseRadius, topRadius, lean, segments = 4 }) {
  const column = new THREE.Group();
  let y = 0;
  let offset = 0;
  for (let segment = 0; segment < segments; segment += 1) {
    const t0 = segment / segments;
    const t1 = (segment + 1) / segments;
    const segmentHeight = height / segments;
    const lower = baseRadius + (topRadius - baseRadius) * t0;
    const upper = baseRadius + (topRadius - baseRadius) * t1;
    const piece = cylinder(upper, lower, segmentHeight, 7, y + segmentHeight / 2);
    offset += lean * (t1 - t0) * height;
    piece.position.x = offset;
    column.add(part(piece, `trunk-${segment}`));
    y += segmentHeight;
  }
  return { column, top: [offset, height, 0] };
}

function palm(rng) {
  const trunkHeight = 0.62;
  const lean = (rng.nextFloat() - 0.5) * 0.22;
  const { column, top } = trunkColumn(rng, {
    height: trunkHeight,
    baseRadius: 0.055,
    topRadius: 0.028,
    lean,
  });
  const frondMeshes = [];
  const fruitMeshes = [];

  // A palm's crown is layered: long outer fronds droop, short inner ones lift.
  const layers = [
    { count: 7, length: 0.52, width: 0.3, droop: 0.34, pitch: -0.15 },
    { count: 6, length: 0.4, width: 0.26, droop: 0.16, pitch: 0.16 },
    { count: 4, length: 0.26, width: 0.2, droop: 0.04, pitch: 0.44 },
  ];
  let index = 0;
  for (const [layerIndex, layer] of layers.entries()) {
    const phase = rng.nextFloat() * Math.PI * 2;
    for (let frond = 0; frond < layer.count; frond += 1) {
      const azimuth = phase + (frond / layer.count) * Math.PI * 2;
      const blade = new THREE.Mesh(
        bladeGeometry({
          length: layer.length * (0.86 + rng.nextFloat() * 0.28),
          width: layer.width,
          droop: layer.droop,
        }),
      );
      blade.position.set(top[0], top[1] - 0.02, top[2]);
      blade.rotation.set(0, -azimuth, layer.pitch + (rng.nextFloat() - 0.5) * 0.12);
      frondMeshes.push(blade);
      index += 1;
    }
    void layerIndex;
  }
  // Fruit sits under the crown and reads at overview distance.
  for (let fruit = 0; fruit < 3; fruit += 1) {
    const node = sphere(0.035, 6, 5, top[1] - 0.05);
    node.position.x = top[0] + Math.cos(fruit * 2.1) * 0.05;
    node.position.z = Math.sin(fruit * 2.1) * 0.05;
    fruitMeshes.push(node);
  }
  return group([
    mergeParts(column.children, "trunk"),
    mergeParts(frondMeshes, "crown"),
    mergeParts(fruitMeshes, "fruit"),
  ]);
}

/**
 * A broadleaf canopy: a short trunk, a few branches, and a bounded cluster of
 * flattened organic masses. The cluster is what makes the crown read as dense
 * foliage instead of a handful of separate balls.
 */
function broadleaf(rng, { trunkFraction = 0.34, clusters = 9, spread = 0.42 } = {}) {
  const branchMeshes = [];
  const canopyMeshes = [];
  const trunkHeight = trunkFraction;
  const { column, top } = trunkColumn(rng, {
    height: trunkHeight,
    baseRadius: 0.07,
    topRadius: 0.045,
    lean: (rng.nextFloat() - 0.5) * 0.14,
    segments: 3,
  });

  const branches = 3 + Math.floor(rng.nextFloat() * 2);
  for (let branch = 0; branch < branches; branch += 1) {
    const azimuth = (branch / branches) * Math.PI * 2 + rng.nextFloat() * 0.4;
    const limb = cylinder(0.02, 0.035, 0.26, 5, 0);
    limb.position.set(top[0], top[1] + 0.06, top[2]);
    limb.rotation.set(0, -azimuth, 0.7);
    branchMeshes.push(limb);
  }

  const crownBase = trunkHeight + 0.06;
  const crownHeight = 1 - crownBase;
  for (let index = 0; index < clusters; index += 1) {
    const azimuth = (index / clusters) * Math.PI * 2 * 1.618;
    const radial = spread * Math.sqrt((index + 0.6) / clusters);
    const lobe = supportSolid(rng, { rings: 3, sides: 8, roughness: 0.5 });
    const size = 0.2 + rng.nextFloat() * 0.14;
    lobe.scale.set(size, size * 0.72, size);
    lobe.position.set(
      top[0] + Math.cos(azimuth) * radial,
      crownBase + crownHeight * (0.32 + rng.nextFloat() * 0.55),
      Math.sin(azimuth) * radial,
    );
    canopyMeshes.push(lobe);
  }
  return group([
    mergeParts(column.children, "trunk"),
    mergeParts(branchMeshes, "branches"),
    mergeParts(canopyMeshes, "canopy"),
  ]);
}

function blossom(rng) {
  return broadleaf(rng, { trunkFraction: 0.3, clusters: 10, spread: 0.44 });
}

/**
 * A bamboo stand: segmented culms with node rings and leaf blades near the top,
 * built as an axial layer family rather than as bare cylinders.
 */
function bambooClump(rng) {
  const culmMeshes = [];
  const leafMeshes = [];
  const culms = 4 + Math.floor(rng.nextFloat() * 4);
  for (let index = 0; index < culms; index += 1) {
    const height = 0.72 + rng.nextFloat() * 0.28;
    const x = (rng.nextFloat() - 0.5) * 0.44;
    const z = (rng.nextFloat() - 0.5) * 0.44;
    const tilt = (rng.nextFloat() - 0.5) * 0.14;

    // One slender prism per culm, and no node rings.
    //
    // This is a proportion rather than a detail choice. Surface sampling draws a
    // fixed number of points uniformly over an entity's triangles, so what a form
    // spends its triangles on decides where it is measured. Measured over the 72
    // authored standing clumps, 99.9 per cent of their triangles sit above 60 per
    // cent of their height: the authored culms are about three parts in a thousand
    // of the geometry, thin enough to carry the bounding box and nothing else.
    //
    // The previous segmented culms with node rings were 77 per cent of the
    // candidate's own triangles, so half its samples landed on stems that the
    // reference has too but never samples. Reference-to-candidate p95 was 4.35 —
    // the canopy was already right — while candidate-to-reference was 31.74, and
    // no other vegetation kind was asymmetric at all. Matching the authored
    // allocation is the faithful fix, not a concession to the metric.
    const culm = cylinder(0.009, 0.013, height, 4, height / 2);
    culm.position.x = x + tilt * height * 0.5;
    culm.position.z = z;
    culmMeshes.push(culm);
  }

  /**
   * The canopy, distributed through a volume rather than hung on the culms.
   *
   * Both of its distributions are measured off the authored clumps rather than
   * chosen. Over 72 standing placements and 6,912 triangle-uniform samples, the
   * authored geometry sits 7.1, 34.9, 41.6 and 16.2 per cent in the top four
   * height deciles and nothing measurable below the sixth, so `CANOPY_FLOOR` is
   * 0.6 and the vertical draw peaks near 0.85. Radially it is broad and peaks
   * near the middle of the box rather than at a shell, which a sum of two uniform
   * draws reproduces without a fitted constant — the previous ring of blades
   * around each culm left the interior two radial deciles empty where the
   * reference has 8.6 per cent of its geometry.
   */
  const CANOPY_FLOOR = 0.6;
  // Enough blades that the canopy clears the foliage-mass floor `vegetation`
  // already gates — a stand may not become a handful of cards — while the culms
  // stay the small share of the triangles the authored clump gives them.
  const blades = 46 + Math.floor(rng.nextFloat() * 14);
  for (let leaf = 0; leaf < blades; leaf += 1) {
    // Triangular about the middle of the height band, then biased upward to match
    // the measured 7/35/42/16 ladder.
    const rise = (rng.nextFloat() + rng.nextFloat()) / 2;
    const t = CANOPY_FLOOR + (1 - CANOPY_FLOOR) * (0.35 + rise * 0.65);
    const azimuth = rng.nextFloat() * Math.PI * 2;
    // Triangular in radius: peaks mid-box and tapers to both the axis and the edge.
    const radius = ((rng.nextFloat() + rng.nextFloat()) / 2) * 0.46;
    const blade = new THREE.Mesh(
      bladeGeometry({
        length: 0.2 + rng.nextFloat() * 0.14,
        width: 0.07,
        droop: 0.14,
        segments: 3,
        curl: 0.2,
      }),
    );
    blade.position.set(Math.cos(azimuth) * radius, t, Math.sin(azimuth) * radius);
    blade.rotation.set(0, -azimuth, -0.3 - rng.nextFloat() * 0.5);
    leafMeshes.push(blade);
  }
  return group([mergeParts(culmMeshes, "culms"), mergeParts(leafMeshes, "foliage")]);
}

/**
 * A bamboo leaf bed: fallen foliage lying across its own footprint.
 *
 * The authored `bamboo_forest` asset is placed as two entirely different things.
 * Seventy-two placements are standing clumps of 19,908 triangles at a
 * height-to-width aspect near 3.9, and fifty-eight are flat pieces — fifty-six of
 * 80 triangles at 10.7 by 0.7 by 4.1 units and two mats of 1,748 triangles up to 85
 * by 5 by 60 — at an aspect near 0.065. Nothing sits between the two clusters.
 *
 * Both were generated as standing clumps, and because Target AABB Extent is a hard
 * output target the flat ones were a clump squashed to a fraction of its height.
 * Measured, `bamboo` was the single largest contributor to the failing surface gate
 * at 3.44 of 9.45 — more than the sixteen distant mountains together.
 *
 * A bed is blades lying nearly flat and fanned across the footprint rather than
 * gathered on a culm, so it reads as ground litter from above and as almost nothing
 * from the side, which is what an 0.7-unit-tall authored piece does.
 */
function bambooBed(rng) {
  const bladeMeshes = [];
  const blades = 26;
  for (let index = 0; index < blades; index += 1) {
    // A deterministic fan with jitter, so the bed covers its footprint evenly
    // instead of clustering wherever the stream happened to land.
    const azimuth = (index / blades) * Math.PI * 2 + (rng.nextFloat() - 0.5) * 0.4;
    const reach = 0.18 + rng.nextFloat() * 0.3;
    const blade = new THREE.Mesh(
      bladeGeometry({
        length: 0.3 + rng.nextFloat() * 0.22,
        width: 0.1,
        // Almost no droop and no curl: a fallen blade lies along the ground rather
        // than arching away from a stem.
        droop: 0.04,
        segments: 3,
        curl: 0.06,
      }),
    );
    blade.position.set(
      Math.cos(azimuth) * reach,
      0.1 + rng.nextFloat() * 0.55,
      Math.sin(azimuth) * reach,
    );
    // Yaw around the fan, then a shallow pitch so blades cross rather than tile.
    blade.rotation.set((rng.nextFloat() - 0.5) * 0.5, -azimuth, (rng.nextFloat() - 0.5) * 0.3);
    bladeMeshes.push(blade);
  }
  return group([mergeParts(bladeMeshes, "foliage")]);
}

/** A weeping crown: trailing blades hung from a compact canopy. */
function willow(rng) {
  const base = broadleaf(rng, { trunkFraction: 0.28, clusters: 6, spread: 0.3 });
  const strandMeshes = [];
  const strands = 12;
  for (let index = 0; index < strands; index += 1) {
    const azimuth = (index / strands) * Math.PI * 2;
    const blade = new THREE.Mesh(
      bladeGeometry({
        length: 0.46 + rng.nextFloat() * 0.16,
        width: 0.1,
        droop: 0.9,
        segments: 5,
        curl: 0.15,
      }),
    );
    blade.position.set(Math.cos(azimuth) * 0.26, 0.82, Math.sin(azimuth) * 0.26);
    blade.rotation.set(0, -azimuth, -1.1);
    strandMeshes.push(blade);
  }
  return group([...base.children, mergeParts(strandMeshes, "strands")]);
}

/** A grass tussock: a radial fan of short blades. */
function grassClump(rng) {
  const bladeMeshes = [];
  const blades = 14 + Math.floor(rng.nextFloat() * 8);
  for (let index = 0; index < blades; index += 1) {
    const azimuth = (index / blades) * Math.PI * 2 * 1.618;
    const radial = 0.3 * Math.sqrt((index + 0.5) / blades);
    const blade = new THREE.Mesh(
      bladeGeometry({
        length: 0.6 + rng.nextFloat() * 0.35,
        width: 0.08,
        droop: 0.42,
        segments: 3,
        curl: 0.3,
      }),
    );
    blade.position.set(Math.cos(azimuth) * radial, 0.02, Math.sin(azimuth) * radial);
    blade.rotation.set(0, -azimuth, -0.95 - rng.nextFloat() * 0.35);
    bladeMeshes.push(blade);
  }
  return group([mergeParts(bladeMeshes, "blades")]);
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
  "swing-tree": (rng) => broadleaf(rng, { trunkFraction: 0.4, clusters: 8, spread: 0.4 }),
  "wish-tree": (rng) => broadleaf(rng, { trunkFraction: 0.32, clusters: 11, spread: 0.46 }),
  willow,
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
  "bamboo-bed": bambooBed,
  "grass-clump": grassClump,
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
