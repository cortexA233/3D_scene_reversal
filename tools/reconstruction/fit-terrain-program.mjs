/**
 * Development-only fitter for the Bounded Semantic Terrain Program.
 *
 * Reads the complete measured elevation evidence and produces the compact
 * semantic controls: a closed coastline of curve controls placed at meaningful
 * shoreline transitions, a bounded set of named analytic landforms fitted to
 * the residual, shore controls, and deterministic noise parameters.
 *
 * The dense evidence stays here. Only the fitted controls cross into the Scene
 * Recipe, and their count is capped by the frozen control budget.
 */

import {
  TERRAIN_CONTROL_BUDGET,
  TERRAIN_PROGRAM_VERSION,
  createTerrainProgramField,
  landformContribution,
  validateTerrainProgram,
} from "../../gt_designer/src/reconstruction/scene/terrain-program.js";

export function elevationSampler(evidence) {
  const { resolution, bounds, heights } = evidence;
  const stepX = (bounds.x1 - bounds.x0) / (resolution - 1);
  const stepZ = (bounds.z1 - bounds.z0) / (resolution - 1);
  return {
    stepX,
    stepZ,
    inRange(x, z) {
      return x >= bounds.x0 && x <= bounds.x1 && z >= bounds.z0 && z <= bounds.z1;
    },
    at(x, z) {
      const fx = Math.min(
        resolution - 1,
        Math.max(0, (x - bounds.x0) / stepX),
      );
      const fz = Math.min(
        resolution - 1,
        Math.max(0, (z - bounds.z0) / stepZ),
      );
      const x0 = Math.floor(fx);
      const z0 = Math.floor(fz);
      const x1 = Math.min(resolution - 1, x0 + 1);
      const z1 = Math.min(resolution - 1, z0 + 1);
      const tx = fx - x0;
      const tz = fz - z0;
      const a = heights[z0 * resolution + x0];
      const b = heights[z0 * resolution + x1];
      const c = heights[z1 * resolution + x0];
      const d = heights[z1 * resolution + x1];
      return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
    },
  };
}

/**
 * Traces the shoreline radius in a dense angular sweep, purely as development
 * evidence for choosing where the semantic controls belong.
 */
function traceShoreline(sampler, centre, seaLevel, sweep = 1440, maximumRadius = 470) {
  const radii = new Array(sweep);
  for (let index = 0; index < sweep; index += 1) {
    const azimuth = (index / sweep) * Math.PI * 2;
    const cos = Math.cos(azimuth);
    const sin = Math.sin(azimuth);
    let low = 0;
    let high = maximumRadius;
    // The shoreline is the outermost sea-level crossing along this ray.
    let found = 0;
    for (let radius = maximumRadius; radius >= 0; radius -= 2) {
      if (sampler.at(centre[0] + cos * radius, centre[1] + sin * radius) >= seaLevel) {
        found = radius;
        break;
      }
    }
    low = Math.max(0, found - 2);
    high = found + 2;
    for (let step = 0; step < 24; step += 1) {
      const mid = (low + high) / 2;
      if (sampler.at(centre[0] + cos * mid, centre[1] + sin * mid) >= seaLevel) low = mid;
      else high = mid;
    }
    radii[index] = (low + high) / 2;
  }
  return radii;
}

/**
 * Places coastline controls where the shoreline actually changes character:
 * every local extremum of the traced radius, then the largest remaining
 * deviations, until the frozen budget is spent.
 */
function chooseCoastControls(radii, budget) {
  const sweep = radii.length;
  const candidates = new Set();
  for (let index = 0; index < sweep; index += 1) {
    const previous = radii[(index - 1 + sweep) % sweep];
    const next = radii[(index + 1) % sweep];
    const current = radii[index];
    if ((current - previous) * (next - current) < 0) candidates.add(index);
  }
  // Rank extrema by how much shoreline they actually carry.
  const ranked = [...candidates].sort((a, b) => {
    const prominence = (index) => {
      const previous = radii[(index - 8 + sweep) % sweep];
      const next = radii[(index + 8) % sweep];
      return Math.abs(radii[index] - (previous + next) / 2);
    };
    return prominence(b) - prominence(a);
  });
  const chosen = new Set();
  // Cardinal anchors keep the curve well conditioned even when the shoreline is
  // locally featureless.
  for (let index = 0; index < 8; index += 1) {
    chosen.add(Math.round((index * sweep) / 8) % sweep);
  }
  for (const index of ranked) {
    if (chosen.size >= budget) break;
    // Keep controls apart so the curve stays a curve rather than a sample list.
    const tooClose = [...chosen].some(
      (other) => Math.min(Math.abs(other - index), sweep - Math.abs(other - index)) < sweep / (budget * 3),
    );
    if (!tooClose) chosen.add(index);
  }
  return [...chosen]
    .sort((a, b) => a - b)
    .map((index) => ({
      azimuth: Number((((index / sweep) * Math.PI * 2)).toFixed(5)),
      radius: Number(radii[index].toFixed(3)),
    }));
}

const LANDFORM_PROBE_GRID = 49;

/**
 * Fits named analytic landforms to the residual between the measured elevation
 * and the coast-only base by matching pursuit: place the landform that explains
 * the largest remaining residual, subtract it, and repeat until the frozen
 * budget is spent or the residual is inside the shore band.
 *
 * Greedily taking the largest raw residuals instead would double-count
 * overlapping features and drive the interior below sea level.
 */
function fitLandforms(sampler, base, centre, radii, budget) {
  const reach = Math.max(...radii);
  const probes = [];
  for (let row = 0; row < LANDFORM_PROBE_GRID; row += 1) {
    for (let column = 0; column < LANDFORM_PROBE_GRID; column += 1) {
      const x = centre[0] + ((column / (LANDFORM_PROBE_GRID - 1)) * 2 - 1) * reach;
      const z = centre[1] + ((row / (LANDFORM_PROBE_GRID - 1)) * 2 - 1) * reach;
      if (!sampler.inRange(x, z)) continue;
      probes.push({ x, z, residual: sampler.at(x, z) - base(x, z) });
    }
  }

  const spacing = (2 * reach) / (LANDFORM_PROBE_GRID - 1);
  // Radius is the reference's own relief scale: wide enough to be a landform,
  // narrow enough that neighbours stay distinguishable.
  const radius = Math.max(spacing * 2.2, 40);
  const landforms = [];

  for (let step = 0; step < budget; step += 1) {
    let peak = null;
    for (const probe of probes) {
      if (!peak || Math.abs(probe.residual) > Math.abs(peak.residual)) peak = probe;
    }
    if (!peak || Math.abs(peak.residual) < 1.5) break;

    const height = peak.residual;
    landforms.push({
      type: height >= 0 ? "hill" : "channel",
      position: [Number(peak.x.toFixed(2)), Number(peak.z.toFixed(2))],
      radius: Number(radius.toFixed(2)),
      height: Number(height.toFixed(2)),
      direction: 0,
      elongation: 1,
    });
    // Subtract exactly what the program will later add, so the fit and the
    // generator can never drift apart.
    const landform = landforms.at(-1);
    for (const probe of probes) {
      probe.residual -= landformContribution(landform, probe.x, probe.z);
    }
  }
  return landforms;
}

/**
 * Fits the three shore controls against the measured shoreline band rather than
 * hand-picking them: the shelf width, the beach height at the waterline, and
 * how far past the shore the sea floor drops away.
 */
function fitShoreControls(sampler, centre, radii, seaLevel, groundY, oceanFloor) {
  const probes = [];
  for (let index = 0; index < radii.length; index += 12) {
    const azimuth = (index / radii.length) * Math.PI * 2;
    const cos = Math.cos(azimuth);
    const sin = Math.sin(azimuth);
    for (let t = 0.6; t <= 1.4; t += 0.04) {
      const radius = radii[index] * t;
      const x = centre[0] + cos * radius;
      const z = centre[1] + sin * radius;
      if (!sampler.inRange(x, z)) continue;
      probes.push({ normalized: t, height: sampler.at(x, z) });
    }
  }
  let best = null;
  for (let shelfFraction = 0.12; shelfFraction <= 0.44; shelfFraction += 0.02) {
    for (let beachHeight = -8; beachHeight <= 2; beachHeight += 1) {
      for (let shelfDrop = 0.15; shelfDrop <= 0.75; shelfDrop += 0.05) {
        let error = 0;
        for (const probe of probes) {
          const interior = 1 - shelfFraction;
          let height;
          if (probe.normalized <= interior) height = groundY;
          else if (probe.normalized <= 1) {
            const t = (probe.normalized - interior) / shelfFraction;
            const smooth = t * t * (3 - 2 * t);
            height = groundY + (seaLevel + beachHeight - groundY) * smooth;
          } else {
            const t = Math.min(1, (probe.normalized - 1) / shelfDrop);
            const smooth = t * t * (3 - 2 * t);
            height =
              seaLevel + beachHeight + (oceanFloor - seaLevel - beachHeight) * smooth;
          }
          error += (height - probe.height) ** 2;
        }
        if (!best || error < best.error) {
          best = {
            error,
            shelfFraction: Number(shelfFraction.toFixed(3)),
            beachHeight,
            shelfDrop: Number(shelfDrop.toFixed(3)),
          };
        }
      }
    }
  }
  return {
    shelfFraction: best.shelfFraction,
    beachHeight: best.beachHeight,
    shelfDrop: best.shelfDrop,
  };
}

export function fitTerrainProgram(evidence, { center, groundY, oceanFloor, sceneSeed }) {
  const sampler = elevationSampler(evidence);
  const seaLevel = evidence.seaLevel;
  const radii = traceShoreline(sampler, center, seaLevel);
  const nodes = chooseCoastControls(radii, TERRAIN_CONTROL_BUDGET.coastNodes);

  const shore = fitShoreControls(sampler, center, radii, seaLevel, groundY, oceanFloor);
  const noise = {
    version: "value-noise-v1",
    octaves: 3,
    frequency: 0.035,
    amplitude: 3,
    lacunarity: 2.1,
    gain: 0.5,
    seed: sceneSeed >>> 0,
  };

  const coastOnly = {
    version: TERRAIN_PROGRAM_VERSION,
    coastline: { center, nodes },
    landforms: [],
    shore,
    noise: { ...noise, amplitude: 0 },
    seaLevel,
    groundY,
    oceanFloor,
  };
  const base = createTerrainProgramField(coastOnly);
  const landforms = fitLandforms(
    sampler,
    base,
    center,
    radii,
    TERRAIN_CONTROL_BUDGET.landforms,
  );

  const program = {
    version: TERRAIN_PROGRAM_VERSION,
    coastline: { center, nodes },
    landforms,
    shore,
    noise,
    seaLevel,
    groundY,
    oceanFloor,
  };
  const errors = validateTerrainProgram(program);
  if (errors.length > 0) {
    throw new Error(`fitted terrain program is invalid:\n- ${errors.join("\n- ")}`);
  }
  return program;
}
