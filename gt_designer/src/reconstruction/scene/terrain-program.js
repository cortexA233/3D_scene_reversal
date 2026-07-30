/**
 * Bounded Semantic Terrain Program.
 *
 * A fixed-cap, resolution-independent description of the island: a closed
 * coastline built from semantically located curve controls, a bounded set of
 * named analytic landforms, compact shore controls, and versioned deterministic
 * noise. Nothing here is a height grid, a regular sample array, a distance
 * field, or source-resolution geometry — the elevation at any world position is
 * computed analytically from the controls below.
 *
 * The control budget is frozen. It is a representation boundary, not a knob to
 * turn until the program becomes a disguised elevation grid.
 */

export const TERRAIN_PROGRAM_VERSION = "bounded-semantic-terrain-v1";

export const TERRAIN_CONTROL_BUDGET = Object.freeze({
  coastNodes: 32,
  landforms: 40,
  noiseOctaves: 4,
});

export const LANDFORM_TYPES = Object.freeze([
  "plateau",
  "ridge",
  "hill",
  "channel",
  "dune",
  "shore-shelf",
]);

export function validateTerrainProgram(program) {
  const errors = [];
  if (program?.version !== TERRAIN_PROGRAM_VERSION) {
    errors.push(`terrain program version must be ${TERRAIN_PROGRAM_VERSION}`);
  }
  const coast = program?.coastline;
  if (!Array.isArray(coast?.nodes) || coast.nodes.length < 8) {
    errors.push("coastline needs at least eight semantic curve controls");
  } else if (coast.nodes.length > TERRAIN_CONTROL_BUDGET.coastNodes) {
    errors.push(
      `coastline uses ${coast.nodes.length} controls, above the frozen budget of ${TERRAIN_CONTROL_BUDGET.coastNodes}`,
    );
  }
  for (const [index, node] of (coast?.nodes ?? []).entries()) {
    if (!Number.isFinite(node?.azimuth) || !Number.isFinite(node?.radius)) {
      errors.push(`coastline node ${index} needs a finite azimuth and radius`);
    }
  }
  if (!Array.isArray(program?.landforms)) {
    errors.push("landforms must be an array");
  } else if (program.landforms.length > TERRAIN_CONTROL_BUDGET.landforms) {
    errors.push(
      `terrain uses ${program.landforms.length} landforms, above the frozen budget of ${TERRAIN_CONTROL_BUDGET.landforms}`,
    );
  } else {
    for (const [index, landform] of program.landforms.entries()) {
      if (!LANDFORM_TYPES.includes(landform?.type)) {
        errors.push(`landform ${index} has an undeclared type ${landform?.type}`);
      }
      if (
        !Array.isArray(landform?.position) ||
        landform.position.length !== 2 ||
        !landform.position.every(Number.isFinite)
      ) {
        errors.push(`landform ${index} needs a world [x,z] position`);
      }
      if (!Number.isFinite(landform?.height) || !Number.isFinite(landform?.radius)) {
        errors.push(`landform ${index} needs a finite height and radius`);
      }
    }
  }
  const noise = program?.noise;
  if (noise?.version !== "value-noise-v1") {
    errors.push("terrain noise must declare version value-noise-v1");
  }
  if (!Number.isFinite(noise?.octaves) || noise.octaves > TERRAIN_CONTROL_BUDGET.noiseOctaves) {
    errors.push(
      `terrain noise uses ${noise?.octaves} octaves, above the frozen budget of ${TERRAIN_CONTROL_BUDGET.noiseOctaves}`,
    );
  }
  const shore = program?.shore;
  if (
    !Number.isFinite(shore?.shelfFraction) ||
    !Number.isFinite(shore?.beachHeight) ||
    !Number.isFinite(shore?.shelfDrop)
  ) {
    errors.push("shore needs shelfFraction, beachHeight, and shelfDrop");
  }
  return errors;
}

/**
 * Periodic cubic interpolation through the coastline controls. The controls are
 * semantic locations; the curve between them is generated, so the shoreline has
 * no resolution of its own.
 */
export function createCoastlineCurve(nodes) {
  const sorted = [...nodes].sort((a, b) => a.azimuth - b.azimuth);
  const count = sorted.length;
  return function radiusAt(azimuth) {
    const twoPi = Math.PI * 2;
    const normalized = ((azimuth % twoPi) + twoPi) % twoPi;
    let index = 0;
    while (index < count && sorted[index].azimuth <= normalized) index += 1;
    const i1 = index % count;
    const i0 = (i1 - 1 + count) % count;
    const im1 = (i0 - 1 + count) % count;
    const i2 = (i1 + 1) % count;

    const a0 = sorted[i0].azimuth;
    let a1 = sorted[i1].azimuth;
    if (a1 <= a0) a1 += twoPi;
    let position = normalized;
    if (position < a0) position += twoPi;
    const t = Math.min(1, Math.max(0, (position - a0) / (a1 - a0)));

    // Catmull-Rom keeps the shoreline smooth between semantic controls while
    // passing exactly through each one.
    const p0 = sorted[im1].radius;
    const p1 = sorted[i0].radius;
    const p2 = sorted[i1].radius;
    const p3 = sorted[i2].radius;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      0.5 *
      (2 * p1 +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
    );
  };
}

function hash2(x, z, seed) {
  let value = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ (seed >>> 0);
  value = Math.imul(value ^ (value >>> 15), value | 1) >>> 0;
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
}

function valueNoise(x, z, seed) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = x - x0;
  const tz = z - z0;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}

function fbm(x, z, { octaves, frequency, amplitude, lacunarity, gain, seed }) {
  let total = 0;
  let currentFrequency = frequency;
  let currentAmplitude = amplitude;
  for (let octave = 0; octave < octaves; octave += 1) {
    total +=
      (valueNoise(x * currentFrequency, z * currentFrequency, seed + octave) - 0.5) *
      2 *
      currentAmplitude;
    currentFrequency *= lacunarity;
    currentAmplitude *= gain;
  }
  return total;
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function landformContribution(landform, x, z) {
  const dx = x - landform.position[0];
  const dz = z - landform.position[1];
  const direction = landform.direction ?? 0;
  const cos = Math.cos(direction);
  const sin = Math.sin(direction);
  const along = dx * cos + dz * sin;
  const across = -dx * sin + dz * cos;
  const elongation = landform.elongation ?? 1;
  const radius = Math.max(1e-3, landform.radius);
  const normalized = Math.hypot(along / (radius * elongation), across / radius);

  switch (landform.type) {
    case "plateau":
      return landform.height * (1 - smoothstep(0.6, 1.1, normalized));
    case "ridge":
      return landform.height * Math.exp(-(across * across) / (2 * radius * radius)) *
        (1 - smoothstep(0.7, 1.2, Math.abs(along) / (radius * elongation)));
    case "channel":
      return -Math.abs(landform.height) * Math.exp(-(normalized * normalized) * 1.8);
    case "dune":
      return landform.height * Math.exp(-(normalized * normalized) * 2.2) *
        Math.cos(normalized * Math.PI * 0.5);
    case "shore-shelf":
      return landform.height * (1 - smoothstep(0.2, 1, normalized));
    case "hill":
    default:
      return landform.height * Math.exp(-(normalized * normalized) * 1.8);
  }
}

/**
 * Builds the analytic elevation function for one program. Resolution is chosen
 * by the caller when it tessellates; this function has none.
 */
export function createTerrainProgramField(program) {
  const radiusAt = createCoastlineCurve(program.coastline.nodes);
  const [cx, cz] = program.coastline.center;
  const { shore, noise, seaLevel, groundY, oceanFloor } = program;

  return function elevationAt(x, z) {
    const dx = x - cx;
    const dz = z - cz;
    const azimuth = Math.atan2(dz, dx);
    const shoreRadius = Math.max(1e-3, radiusAt(azimuth));
    const normalized = Math.hypot(dx, dz) / shoreRadius;

    // Interior plateau, shore shelf, then ocean floor — all analytic in the
    // normalized coastal coordinate.
    const interior = 1 - shore.shelfFraction;
    let height;
    if (normalized <= interior) {
      height = groundY;
    } else if (normalized <= 1) {
      const t = (normalized - interior) / shore.shelfFraction;
      height = groundY + (seaLevel + shore.beachHeight - groundY) * smoothstep(0, 1, t);
    } else {
      const t = Math.min(1, (normalized - 1) / shore.shelfDrop);
      height =
        seaLevel + shore.beachHeight + (oceanFloor - seaLevel - shore.beachHeight) * smoothstep(0, 1, t);
    }

    for (const landform of program.landforms) {
      height += landformContribution(landform, x, z);
    }

    if (normalized <= 1.15) {
      height += fbm(x, z, noise) * (1 - smoothstep(0.85, 1.15, normalized));
    }
    return height;
  };
}
